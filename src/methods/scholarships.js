/**
 * Scholarship Methods
 */
import { pb } from '../config.js'

function legacyWalletMutationsDisabledNotice(ctx) {
    ctx.showNotification(
        "Legacy GM wallet transactions are disabled. Use FM for wallet balance operations.",
        "error"
    );
}

function legacyWalletMutationsAreDisabled(ctx) {
    return ctx?.disableLegacyWalletMutations !== false;
}

/**
 * Calculate months between start and end date from modalScholarship
 * Returns 0 if dates are invalid or end is before start
 */
export function getScholarshipMonths() {
    if (!this.modalScholarship.startDate || !this.modalScholarship.endDate) {
        return 0;
    }
    
    const start = new Date(this.modalScholarship.startDate);
    const end = new Date(this.modalScholarship.endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return 0;
    }
    
    // Calculate months difference
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    
    // Add partial month if end day is >= start day
    const partialMonth = end.getDate() >= start.getDate() ? 0 : -1;
    
    return Math.max(0, months + partialMonth + 1); // +1 to include the starting month
}

/**
 * Get all scholarship projects, sorted by creation date (newest first)
 */
export function getScholarships() {
    return this.projects
        .filter(p => p.type === 'scholarship')
        .sort((a, b) => new Date(b.created) - new Date(a.created));
}

/**
 * Save a new scholarship
 * - Calculates and stores scholarshipValue (in-kind, not deducted from wallet)
 * - If fixedCost > 0, deducts from wallet and creates SCHOLARSHIP transaction
 */
export async function saveScholarship() {
    if (!this.hasPerm('gm.createScholarship')) {
        this.showNotification("You don't have permission to create scholarships.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to create scholarships.", "error");
        return;
    }
    
    // Validate required fields
    if (!this.modalScholarship.name) {
        this.showNotification("Name is required", "error");
        return;
    }
    if (!this.modalScholarship.startDate || !this.modalScholarship.endDate) {
        this.showNotification("Start and end dates are required", "error");
        return;
    }
    
    const months = this.getScholarshipMonths();
    if (months <= 0) {
        this.showNotification("End date must be after start date", "error");
        return;
    }

    try {
        this.showLoading("Creating scholarship...");
        
        // Handle fixed cost if provided (actual cash payment)
        const fixedCost = this.modalScholarship.fixedCost || 0;
        if (fixedCost > 0) {
            if (!this.modalScholarship.walletId) {
                this.hideLoading();
                this.showNotification("Please select a wallet for the fixed cost payment", "error");
                return;
            }
            
            const wallet = this.wallets.find(w => w.id === this.modalScholarship.walletId);
            if (!wallet) {
                this.hideLoading();
                this.showNotification("Invalid wallet selected", "error");
                return;
            }
            if (wallet.balance < fixedCost) {
                this.hideLoading();
                this.showNotification("Insufficient funds in " + wallet.name, "error");
                return;
            }

            if (legacyWalletMutationsAreDisabled(this)) {
                legacyWalletMutationsDisabledNotice(this);
                this.hideLoading();
                return;
            }

            // Deduct from wallet immediately
            await pb.collection('wallets').update(wallet.id, { 
                balance: wallet.balance - fixedCost 
            });

            // Create SCHOLARSHIP transaction
            await pb.collection('transactions').create({
                date: new Date().toISOString(),
                wallet: wallet.id,
                type: 'SCHOLARSHIP',
                amount: -fixedCost, // Negative amount for outgoing
                description: `Scholarship Fixed Cost: ${this.modalScholarship.name}`
            });
        }

        // Calculate scholarship value (in-kind, stored at creation)
        const scholarshipValue = months * this.settings.scholarshipRate;

        // Create scholarship project
        const scholarshipData = {
            title: this.modalScholarship.name,
            description: this.modalScholarship.description || "",
            type: 'scholarship',
            scholarshipValue: scholarshipValue,
            scholarshipStartDate: this.modalScholarship.startDate,
            scholarshipEndDate: this.modalScholarship.endDate,
            scholarshipFeedback: this.modalScholarship.feedback || "",
            scholarshipFixedCost: fixedCost
        };

        await pb.collection('projects').create(scholarshipData);

        const userName = this.getCurrentUserName();
        this.logAction(`${userName} created scholarship '${this.modalScholarship.name}'`);

        // Reset form
        this.modalScholarship = { 
            name: '', 
            description: '', 
            startDate: '', 
            endDate: '', 
            fixedCost: 0, 
            walletId: null, 
            feedback: '' 
        };
        
        // Clear Quill editors
        if (this.scholarshipDescriptionEditor) {
            this.scholarshipDescriptionEditor.root.innerHTML = '';
        }
        if (this.scholarshipFeedbackEditor) {
            this.scholarshipFeedbackEditor.root.innerHTML = '';
        }

        // Refresh data
        await this.fetchProjects();
        await this.fetchWallets();
        await this.fetchTransactions();
        
        this.hideLoading();
        this.showNotification("Scholarship created successfully!", "success");
    } catch (error) {
        this.hideLoading();
        console.error('Error creating scholarship:', error);
        this.showNotification("Error: " + (error.message || 'Unknown error'), "error");
    }
}
