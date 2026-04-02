/**
 * Allocation Methods (Manual Cash Grant & In-Kind Allocation)
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

// ========== COMPLETION METHODS ==========
export function openManualGrantDialog(item) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to grant funds.", "error");
        return;
    }
    
    this.manualGrantTier = item;
    this.manualGrantWallet = null;
    // Initialize breakdown to zero (for divisible tiers, user will enter amounts)
    this.manualGrantBreakdown = { assets: 0, services: 0, logistics: 0, support: 0 };
    // For all-or-nothing, we still need manualGrantAmount for the full amount
    // Use costsFunded for monetary tracking (not funded which may include labor value)
    const monetaryFunded = item.costsFunded !== undefined ? item.costsFunded : (item.funded || 0);
    const remainingAmount = item.cost - monetaryFunded;
    this.manualGrantAmount = remainingAmount;
    this.showManualGrantDialog = true;
}

export function getManualGrantBreakdownTotal() {
    if (!this.manualGrantBreakdown) return 0;
    return (this.manualGrantBreakdown.assets || 0) + 
           (this.manualGrantBreakdown.services || 0) + 
           (this.manualGrantBreakdown.logistics || 0) + 
           (this.manualGrantBreakdown.support || 0);
}

export function getGrantAmount() {
    if (!this.manualGrantTier) return 0;
    // Use costsFunded for monetary tracking (not funded which may include labor value)
    const monetaryFunded = this.manualGrantTier.costsFunded !== undefined ? this.manualGrantTier.costsFunded : (this.manualGrantTier.funded || 0);
    const remainingAmount = this.manualGrantTier.cost - monetaryFunded;
    // For divisible tiers, use the calculated breakdown total; for all-or-nothing, use remaining amount
    if (this.manualGrantTier.tierRef && this.manualGrantTier.tierRef.allowPartial) {
        return this.getManualGrantBreakdownTotal();
    }
    return remainingAmount;
}

export async function executeManualCashGrant() {
    if (!this.hasPerm('gm.confirmSelections')) {
        this.showNotification("You don't have permission to execute grants.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to grant funds.", "error");
        return;
    }
    
    if (!this.manualGrantTier || !this.manualGrantWallet) {
        this.showNotification("Please select a wallet.", "error");
        return;
    }
    
    const wallet = this.wallets.find(w => w.id === this.manualGrantWallet);
    if (!wallet) {
        this.showNotification("Wallet not found.", "error");
        return;
    }
    
    // Get the grant amount (uses breakdown total for divisible, remaining for all-or-nothing)
    const grantAmount = this.getGrantAmount();
    
    if (grantAmount <= 0) {
        this.showNotification("Grant amount must be greater than zero.", "error");
        return;
    }
    
    // For divisible tiers, validate the breakdown total
    if (this.manualGrantTier.tierRef && this.manualGrantTier.tierRef.allowPartial) {
        const breakdownTotal = this.getManualGrantBreakdownTotal();
        if (breakdownTotal <= 0) {
            this.showNotification("Please enter allocation amounts in the breakdown.", "error");
            return;
        }
        // Use costsFunded for monetary tracking (funded may include labor value)
        const monetaryFunded = this.manualGrantTier.costsFunded !== undefined ? this.manualGrantTier.costsFunded : (this.manualGrantTier.funded || 0);
        const remainingAmount = this.manualGrantTier.cost - monetaryFunded;
        if (breakdownTotal > remainingAmount) {
            this.showNotification("Allocation total cannot exceed remaining amount ($" + this.formatMoney(remainingAmount) + ").", "error");
            return;
        }
    }
    
    if (wallet.balance < grantAmount) {
        this.showNotification("Insufficient funds in " + wallet.name + " ($" + this.formatMoney(wallet.balance) + " available, $" + this.formatMoney(grantAmount) + " needed)", "error");
        return;
    }

    if (legacyWalletMutationsAreDisabled(this)) {
        // Legacy GM wallet balance mutations are intentionally disabled.
        legacyWalletMutationsDisabledNotice(this);
        return;
    }
    
    try {
        this.showLoading("Processing manual grant allocation...");
        
        // Get tier record
        const tierRecord = await pb.collection('tiers').getOne(this.manualGrantTier.tierId);
        
        // For divisible tiers: use the manual breakdown input
        // For all-or-nothing: use tier's original breakdown
        let breakdown = null;
        if (this.manualGrantTier.tierRef && this.manualGrantTier.tierRef.allowPartial) {
            // Use the manual breakdown inputs
            breakdown = this.manualGrantBreakdown;
        } else if (tierRecord.breakdown) {
            // Use existing breakdown (for all-or-nothing)
            breakdown = typeof tierRecord.breakdown === 'string' ? JSON.parse(tierRecord.breakdown) : tierRecord.breakdown;
        }
        
        // Update wallet balance (freeze funds - deduct grant amount)
        const newBalance = wallet.balance - grantAmount;
        await pb.collection('wallets').update(wallet.id, { balance: newBalance });
        
        // Update tier: set allocatedAmount (NOT funded), status to 'pending'
        await pb.collection('tiers').update(this.manualGrantTier.tierId, {
            allocatedAmount: grantAmount, // Set allocated amount (will be reset to 0 after verification)
            status: 'pending', // Move to verification queue
            field: 'manual' // Track how funds were allocated (PocketBase field name)
            // Note: funded is NOT updated here - only after verification
        });
        
        // Create ALLOCATION transaction (negative amount - freezes funds)
        await pb.collection('transactions').create({
            date: new Date().toISOString(),
            wallet: wallet.id,
            type: 'ALLOCATION',
            amount: -grantAmount, // Negative amount (frozen/deducted)
            description: `Funds allocated to Step ${this.manualGrantTier.level} of ${this.manualGrantTier.projName}`,
            project: this.manualGrantTier.projId,
            tier: this.manualGrantTier.tierId,
            details: breakdown ? JSON.stringify([{
                projId: this.manualGrantTier.projId,
                tierId: this.manualGrantTier.tierId,
                level: this.manualGrantTier.level,
                amount: grantAmount,
                breakdown: breakdown
            }]) : JSON.stringify([{
                projId: this.manualGrantTier.projId,
                tierId: this.manualGrantTier.tierId,
                level: this.manualGrantTier.level,
                amount: grantAmount
            }]),
            sources: JSON.stringify([{
                name: wallet.name,
                amount: grantAmount
            }])
        });
        
        // Refresh data
        await this.fetchProjects();
        await this.fetchWallets();
        await this.fetchTransactions();
        
        this.hideLoading();
        this.showNotification(
            `Funds allocated successfully! Step moved to Documental Proof tab for verification.`,
            "success"
        );
        this.showManualGrantDialog = false;
        this.manualGrantTier = null;
        this.manualGrantWallet = null;
        this.manualGrantAmount = 0;
        this.manualGrantBreakdown = { assets: 0, services: 0, logistics: 0, support: 0 };
        this.manualGrantBreakdown = null;
    } catch (error) {
        console.error("Error executing manual grant:", error);
        this.hideLoading();
        this.showNotification("Error: " + (error.message || 'Unknown error'), "error");
    }
}

export function openInKindAllocationDialog(item) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to allocate in-kind grants.", "error");
        return;
    }
    
    // For all-or-nothing with monetary costs, require wallet to be pre-selected
    // For divisible, wallet will be selected in the dialog
    if (!item.allowPartial && item.cashVal > 0 && !item.walletId) {
        this.showNotification("Error: No Source Wallet selected for materials. Please edit the project to select a wallet.", "error");
        return;
    }
    
    this.inKindAllocationItem = item;
    this.inKindAllocationWallet = null; // Will be selected in dialog
    
    // Calculate REMAINING labor values
    // item.laborVal is the remaining labor value (after subtracting laborFunded)
    // item.laborPeople/Hours/Rate are the ORIGINAL values
    const originalLaborVal = item.originalLaborVal || (item.laborPeople * item.laborHours * item.laborRate);
    const remainingLaborVal = item.laborVal || 0;
    
    // Calculate remaining proportion to scale people/hours
    let remainingProportion = 1;
    if (originalLaborVal > 0) {
        remainingProportion = remainingLaborVal / originalLaborVal;
    }
    
    // For simplicity, keep people and rate the same, scale hours
    // This makes it clearer for the user what work remains
    const remainingHours = Math.round((item.laborHours || 0) * remainingProportion * 100) / 100;
    
    this.inKindAllocationLabor = {
        people: item.laborPeople || 0,
        hours: remainingHours,
        rate: item.laborRate || 5
    };
    
    // Calculate REMAINING costs
    // item.cashVal is the remaining cash value (after subtracting costsFunded)
    // Scale each cost category proportionally
    const breakdown = this.getBreakdown(item.tierRef);
    const originalCash = (breakdown.assets || 0) + (breakdown.services || 0) + (breakdown.logistics || 0) + (breakdown.support || 0);
    const remainingCash = item.cashVal || 0;
    
    let costsProportion = 1;
    if (originalCash > 0) {
        costsProportion = remainingCash / originalCash;
    }
    
    this.inKindAllocationCosts = {
        assets: Math.round((breakdown.assets || 0) * costsProportion * 100) / 100,
        services: Math.round((breakdown.services || 0) * costsProportion * 100) / 100,
        logistics: Math.round((breakdown.logistics || 0) * costsProportion * 100) / 100,
        support: Math.round((breakdown.support || 0) * costsProportion * 100) / 100
    };
    
    this.showInKindAllocationDialog = true;
}

export function getInKindAllocationLaborValue() {
    if (!this.inKindAllocationLabor) return 0;
    return (this.inKindAllocationLabor.people || 0) * 
           (this.inKindAllocationLabor.hours || 0) * 
           (this.inKindAllocationLabor.rate || 0);
}

export function getInKindAllocationCostsTotal() {
    if (!this.inKindAllocationCosts) return 0;
    return (this.inKindAllocationCosts.assets || 0) + 
           (this.inKindAllocationCosts.services || 0) +
           (this.inKindAllocationCosts.logistics || 0) + 
           (this.inKindAllocationCosts.support || 0);
}

export async function executeInKindAllocation() {
    if (!this.hasPerm('gm.confirmSelections')) {
        this.showNotification("You don't have permission to execute allocations.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to allocate in-kind grants.", "error");
        return;
    }
    
    if (!this.inKindAllocationItem) {
        this.showNotification("Error: Invalid item data.", "error");
        return;
    }
    
    // Validate labor inputs
    if (!this.inKindAllocationLabor.people || !this.inKindAllocationLabor.hours || !this.inKindAllocationLabor.rate) {
        this.showNotification("Please enter people, hours, and rate for labor.", "error");
        return;
    }
    
    const costsTotal = this.getInKindAllocationCostsTotal();
    
    // If there are monetary costs to allocate, validate wallet and balance
    if (costsTotal > 0) {
        if (!this.inKindAllocationWallet) {
            this.showNotification("Please select a wallet for monetary costs.", "error");
            return;
        }
        
        // For divisible tiers, check if allocated costs exceed budget
        if (this.inKindAllocationItem.allowPartial && costsTotal > this.inKindAllocationItem.cashVal) {
            this.showNotification("Allocated costs cannot exceed available costs ($" + this.formatMoney(this.inKindAllocationItem.cashVal) + ").", "error");
            return;
        }
        
        const wallet = this.wallets.find(w => w.id === this.inKindAllocationWallet);
        if (!wallet) {
            this.showNotification("Wallet not found.", "error");
            return;
        }
        
        if (wallet.balance < costsTotal) {
            this.showNotification("Insufficient funds in " + wallet.name + " ($" + this.formatMoney(wallet.balance) + " available, $" + this.formatMoney(costsTotal) + " needed)", "error");
            return;
        }
    }

    if (legacyWalletMutationsAreDisabled(this)) {
        // Legacy GM wallet balance mutations are intentionally disabled.
        // In-kind verification should run through FM-backed workflows.
        legacyWalletMutationsDisabledNotice(this);
        return;
    }
    
    try {
        this.showLoading("Processing in-kind allocation...");
        
        // Get tier record
        const tierRecord = await pb.collection('tiers').getOne(this.inKindAllocationItem.tierRef.id);
        
        // Freeze monetary costs (if any)
        if (costsTotal > 0 && this.inKindAllocationWallet) {
            const wallet = this.wallets.find(w => w.id === this.inKindAllocationWallet);
            const newBalance = wallet.balance - costsTotal;
            await pb.collection('wallets').update(wallet.id, { balance: newBalance });
            
            // Create ALLOCATION transaction for monetary costs
            await pb.collection('transactions').create({
                date: new Date().toISOString(),
                wallet: wallet.id,
                type: 'ALLOCATION',
                amount: -costsTotal, // Negative amount (frozen/deducted)
                description: `Funds allocated to Step ${this.inKindAllocationItem.level} of ${this.inKindAllocationItem.projName} (In-Kind)`,
                project: this.inKindAllocationItem.projId,
                tier: this.inKindAllocationItem.tierRef.id,
                details: JSON.stringify([{
                    projId: this.inKindAllocationItem.projId,
                    tierId: this.inKindAllocationItem.tierRef.id,
                    level: this.inKindAllocationItem.level,
                    amount: costsTotal,
                    breakdown: this.inKindAllocationCosts,
                    labor: this.inKindAllocationLabor
                }]),
                sources: JSON.stringify([{
                    name: wallet.name,
                    amount: costsTotal
                }])
            });
        }
        
        // Update tier: set allocatedAmount (monetary costs only), store planned labor, status to 'pending'
        const updateData = {
            allocatedAmount: costsTotal, // Only monetary costs are frozen
            status: 'pending', // Move to verification queue
            field: 'inkind', // Track how funds were allocated (PocketBase field name)
            // NEW: Use proper fields for labor planning
            laborPlannedPeople: this.inKindAllocationLabor.people,
            laborPlannedHours: this.inKindAllocationLabor.hours,
            laborPlannedRate: this.inKindAllocationLabor.rate,
            // DEPRECATED: Keep inKindDetails for backward compatibility during transition
            inKindDetails: JSON.stringify({
                people: this.inKindAllocationLabor.people,
                hours: this.inKindAllocationLabor.hours,
                rate: this.inKindAllocationLabor.rate,
                walletId: this.inKindAllocationWallet
            })
            // Note: funded is NOT updated here - only after verification
        };
        
        await pb.collection('tiers').update(this.inKindAllocationItem.tierRef.id, updateData);
        
        // Refresh data
        await this.fetchProjects();
        await this.fetchWallets();
        await this.fetchTransactions();
        
        this.hideLoading();
        this.showNotification(
            `In-kind grant allocated successfully! Step moved to Documental Proof tab for verification.`,
            "success"
        );
        this.showInKindAllocationDialog = false;
        this.inKindAllocationItem = null;
        this.inKindAllocationLabor = { people: 0, hours: 0, rate: 0 };
        this.inKindAllocationCosts = { assets: 0, services: 0, logistics: 0, support: 0 };
        this.inKindAllocationWallet = null;
    } catch (error) {
        console.error("Error executing in-kind allocation:", error);
        this.hideLoading();
        this.showNotification("Error: " + (error.message || 'Unknown error'), "error");
    }
}

