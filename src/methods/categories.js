/**
 * Category & Admin Methods
 * ~890 lines
 */
import { pb } from '../config.js'

// ========== CATEGORY METHODS ==========
export async function addCategory() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to add categories.", "error");
        return;
    }
    
    if (!this.newCategory) return;
    if (this.categories.includes(this.newCategory)) {
        this.showNotification("Category already exists", "error");
        return;
    }

    try {
        this.showLoading("Adding category...");
        
        // Store current categories count before adding
        const categoriesBefore = await pb.collection('categories').getFullList();
        console.log('Categories before adding:', categoriesBefore.length, categoriesBefore.map(c => c.name));
        
        // Create new category
        const newCategoryRecord = await pb.collection('categories').create({ name: this.newCategory });
        console.log('New category created:', newCategoryRecord);
        
        // Verify all categories still exist
        const categoriesAfter = await pb.collection('categories').getFullList();
        console.log('Categories after adding:', categoriesAfter.length, categoriesAfter.map(c => c.name));
        
        if (categoriesAfter.length < categoriesBefore.length + 1) {
            console.error('⚠️ WARNING: Categories were deleted! Before:', categoriesBefore.length, 'After:', categoriesAfter.length);
            this.showNotification("Warning: Some categories may have been deleted. Please check PocketBase.", "error");
        }
        
        await this.fetchCategories();
        this.newCategory = '';
        this.hideLoading();
        this.showNotification("Category added successfully!", "success");
    } catch (error) {
        this.hideLoading();
        console.error('Error adding category:', error);
        this.showNotification("Error: " + (error.message || 'Unknown error'), "error");
    }
}

export async function removeCategory(cat) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to remove categories.", "error");
        return;
    }

    // Prevent deletion of Scholarship category
    if (cat === 'Scholarship') {
        this.showNotification("Scholarship category cannot be deleted. It is automatically assigned to scholarship projects.", "error");
        return;
    }

    const record = (this.categoryRecords || []).find(r => r.name === cat);
    if (!record) {
        this.showNotification("Category not found.", "error");
        return;
    }

    const projectsUsingCategory = this.projects.filter(p =>
        p.categories && Array.isArray(p.categories) && p.categories.includes(cat)
    );

    if (projectsUsingCategory.length > 0) {
        const replacementOptions = (this.categoryRecords || []).filter(
            c => c.name !== cat && c.name !== 'Scholarship'
        );
        if (replacementOptions.length === 0) {
            this.showNotification("Create at least one other category in Settings before deleting this one.", "error");
            return;
        }
        this.categoryToDelete = cat;
        this.categoryToDeleteId = record.id;
        this.projectsUsingCategory = projectsUsingCategory.map(p => ({
            project: p,
            replacement: '' // category id when selected; required for all
        }));
        this.showCategoryReplaceModal = true;
    } else {
        await this.executeRemoveCategory(record.id, []);
    }
}

export function setProjectReplacement(projectId, replacementCategoryId) {
    const item = this.projectsUsingCategory.find(item => item.project.id === projectId);
    if (item) {
        item.replacement = replacementCategoryId || ''; // category record id
    }
}

export function closeCategoryReplaceModal() {
    this.showCategoryReplaceModal = false;
    this.categoryToDelete = null;
    this.categoryToDeleteId = null;
    this.projectsUsingCategory = [];
}

export function openEditCategory(record) {
    if (!record || record.name === 'Scholarship') return;
    this.editingCategoryId = record.id;
    this.editingCategoryName = record.name;
    this.editingCategoryNameEs = record.name_es || '';
    this.editingCategoryColor = record.color && /^#([0-9a-fA-F]{3}){1,2}$/.test(record.color) ? record.color : '#95a5a6';
    this.showEditCategoryModal = true;
}

export async function saveCategoryEdit() {
    if (!this.editingCategoryId || !this.editingCategoryName?.trim()) {
        this.showNotification("Category name cannot be empty.", "error");
        return;
    }
    const name = this.editingCategoryName.trim();
    const alreadyUsed = (this.categoryRecords || []).some(r => r.id !== this.editingCategoryId && r.name === name);
    if (alreadyUsed) {
        this.showNotification("A category with this name already exists.", "error");
        return;
    }
    const nameEs = (this.editingCategoryNameEs || '').trim();
    const color = (this.editingCategoryColor || '').trim();
    const colorValue = color && /^#([0-9a-fA-F]{3}){1,2}$/.test(color) ? color : null;
    try {
        this.showLoading("Saving category...");
        await pb.collection('categories').update(this.editingCategoryId, { name, name_es: nameEs || null, color: colorValue });
        await this.fetchCategories();
        this.showEditCategoryModal = false;
        this.editingCategoryId = null;
        this.editingCategoryName = '';
        this.editingCategoryNameEs = '';
        this.editingCategoryColor = '';
        this.hideLoading();
        this.showNotification("Category updated.", "success");
    } catch (error) {
        this.hideLoading();
        this.showNotification("Error updating category: " + (error.message || 'Unknown error'), "error");
    }
}

export async function executeRemoveCategory(categoryIdToDelete, projectUpdates) {
    try {
        const totalProjects = projectUpdates.length;
        const categoryName = (this.categoryRecords || []).find(r => r.id === categoryIdToDelete)?.name || 'Category';

        if (totalProjects > 0) {
            this.showLoading(`Updating ${totalProjects} project(s), then deleting category...`);
            for (const item of projectUpdates) {
                const newCategoryId = item.replacement || null;
                await pb.collection('projects').update(item.project.id, {
                    category: newCategoryId
                });
            }
        }

        this.showLoading(totalProjects > 0 ? 'Deleting category...' : 'Deleting category...');
        await pb.collection('categories').delete(categoryIdToDelete);

        await this.fetchCategories();
        await this.fetchProjects();

        this.hideLoading();
        let successText = `Category "${categoryName}" deleted successfully`;
        if (totalProjects > 0) {
            successText += ` (${totalProjects} project(s) updated)`;
        }
        successText += '!';
        this.showNotification(successText, "success");

        this.showCategoryReplaceModal = false;
        this.categoryToDelete = null;
        this.categoryToDeleteId = null;
        this.projectsUsingCategory = [];
    } catch (error) {
        this.hideLoading();
        this.showNotification("Error removing category: " + (error.message || 'Unknown error'), "error");
    }
}

export async function confirmCategoryReplacement() {
    if (!this.categoryToDeleteId || !this.projectsUsingCategory.length) return;

    const missing = this.projectsUsingCategory.filter(item => !item.replacement);
    if (missing.length > 0) {
        this.showNotification(
            `Select a replacement category for every project (${missing.length} missing).`,
            "error"
        );
        return;
    }

    await this.executeRemoveCategory(this.categoryToDeleteId, this.projectsUsingCategory);
}

// ========== EXPORT METHODS ==========
export async function exportReport() {
    if (typeof JSZip === 'undefined') {
        this.showNotification("JSZip library failed to load. Please refresh the page.", "error");
        return;
    }
    const from = this.exportDateFrom;
    const to = this.exportDateTo;
    if (!from || !to || new Date(from) > new Date(to)) {
        this.showNotification("Please select a valid date range.", "error");
        return;
    }
    this.exportReportInProgress = true;
    this.exportProgress = 0;
    this.exportProgressMessage = 'Fetching transactions...';
    const realTypes = ['DEPOSIT', 'DONATION'];
    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_PB_URL || ''));
    const authToken = pb.authStore.token;
    const headers = authToken ? { 'Authorization': authToken } : {};
    const sanitize = (name) => (name || 'Unknown').replace(/[/\\:*?"<>|]/g, '_').trim() || 'Project';
    try {
        const allTx = await pb.collection('transactions').getFullList({ sort: 'date' });
        this.exportProgress = 10;
        this.exportProgressMessage = 'Filtering by date and type...';
        const inRange = allTx.filter(t => realTypes.includes(t.type) && t.date && new Date(t.date) >= new Date(from) && new Date(t.date) <= new Date(to));
        const zip = new JSZip();
        const rootName = `Report_${from}_to_${to}`;
        const depositsFolder = zip.folder(rootName).folder('Deposits_and_Donations');
        const rows = [['Date', 'Type', 'Amount', 'Description', 'Wallet', 'Receipt']];
        inRange.sort((a, b) => new Date(a.date) - new Date(b.date));
        for (const tx of inRange) {
            const walletName = (this.wallets && this.wallets.find(w => w.id === tx.wallet)) ? this.wallets.find(w => w.id === tx.wallet).name : (tx.wallet || '');
            const receiptName = (tx.receipt && (Array.isArray(tx.receipt) ? tx.receipt[0] : tx.receipt)) ? (typeof tx.receipt === 'string' ? tx.receipt : (tx.receipt.name || tx.receipt)) : '';
            rows.push([
                tx.date ? new Date(tx.date).toISOString().slice(0, 10) : '',
                tx.type || '',
                (tx.amount != null) ? String(tx.amount) : '',
                (tx.description || '').replace(/"/g, '""'),
                walletName,
                receiptName
            ]);
        }
        depositsFolder.file('transactions.csv', rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'));
        const totalReceipts = inRange.filter(t => t.receipt && (Array.isArray(t.receipt) ? t.receipt.length : t.receipt)).length;
        let done = 0;
        for (const tx of inRange) {
            const receipt = tx.receipt;
            if (!receipt) continue;
            const filename = Array.isArray(receipt) ? receipt[0] : receipt;
            const name = typeof filename === 'object' ? (filename.name || filename) : filename;
            if (!name) continue;
            const url = `${baseUrl}/api/files/transactions/${tx.id}/${name}`;
            try {
                const res = await fetch(url, { headers, credentials: 'include' });
                if (res.ok) {
                    const blob = await res.blob();
                    const ext = (name || '').split('.').pop() || 'pdf';
                    depositsFolder.file(`receipt_${tx.id}.${ext}`, blob);
                }
            } catch (e) { console.warn('Could not fetch receipt:', url, e); }
            done++;
            this.exportProgress = 10 + Math.floor((done / Math.max(totalReceipts, 1)) * 30);
            this.exportProgressMessage = `Downloading receipts ${done}/${totalReceipts}...`;
        }
        this.exportProgress = 40;
        this.exportProgressMessage = 'Fetching projects and proof files...';
        const projects = await pb.collection('projects').getFullList({ expand: 'tiers' });
        const collId = collectionIdCache.tiers || 'tiers';
        let projectIdx = 0;
        const projectsWithProof = projects.filter(p => {
            const tiers = p.tiers || (p.expand && p.expand.tiers) || [];
            return (Array.isArray(tiers) ? tiers : []).some(t => this.hasProof(t));
        });
        for (const p of projectsWithProof) {
            const projectName = sanitize(p.title);
            const folder = zip.folder(rootName).folder(projectName);
            const tiers = p.tiers || (p.expand && p.expand.tiers) || [];
            const tiersWithProof = (Array.isArray(tiers) ? tiers : []).filter(t => this.hasProof(t));
            let proofIdx = 0;
            for (const tier of tiersWithProof) {
                const urls = this.getProofUrls(tier);
                for (let i = 0; i < urls.length; i++) {
                    proofIdx++;
                    const ext = (urls[i].filename || '').split('.').pop() || 'pdf';
                    const safeName = `proof_Step${tier.level || '?'}_${proofIdx}.${ext}`;
                    try {
                        const res = await fetch(urls[i].url, { headers, credentials: 'include' });
                        if (res.ok) {
                            const blob = await res.blob();
                            folder.file(safeName, blob);
                        }
                    } catch (e) { console.warn('Could not fetch proof:', urls[i].url, e); }
                }
            }
            projectIdx++;
            this.exportProgress = 40 + Math.floor((projectIdx / Math.max(projectsWithProof.length, 1)) * 45);
            this.exportProgressMessage = `Adding project "${projectName}" (${projectIdx}/${projectsWithProof.length})...`;
        }
        this.exportProgress = 88;
        this.exportProgressMessage = 'Building ZIP...';
        const blob = await zip.generateAsync({ type: 'blob' });
        this.exportProgress = 100;
        this.exportProgressMessage = 'Done.';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Report_${from}_to_${to}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        const userName = this.getCurrentUserName();
        this.logAction(`${userName} exported report (${from} to ${to})`);
        this.showNotification('Export downloaded.', 'success');
        this.showExportReportModal = false;
    } catch (e) {
        console.error('Export error:', e);
        this.showNotification('Export failed: ' + (e.message || 'Unknown error'), 'error');
    }
    this.exportReportInProgress = false;
    this.exportProgress = 0;
    this.exportProgressMessage = '';
}

// ========== RESET/ADMIN METHODS ==========
export async function resetDatabase() {
    // Only touches GM collections: transactions, photos, tiers, project_attachments, project_comments, project_todos, projects, wallets, logbook.
    // Does NOT touch FM collections (fm_wallets, fm_user_wallet_access, fm_transactions, fm_wallet_categories, fm_labels) or users.
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to reset the database.", "error");
        return;
    }
    
    if (this.resetConfirmationText !== 'RESET') {
        this.showNotification("Please type 'RESET' to confirm.", "error");
        return;
    }
    
    try {
        this.uploadProgress = 0;
        this.showLoading("Preparing to reset database...");
        
        // Delete in order: Transactions → Photos → Tiers → project_attachments → project_comments → project_todos → Projects → Wallets → Logbook (GM only)
        // This order ensures we don't have foreign key issues (delete things that reference projects before projects)
        this.loadingMessage = "Counting items to delete...";
        this.uploadProgress = 2;
        
        let transactions = [];
        let photos = [];
        let tiers = [];
        let projectAttachments = [];
        let projectComments = [];
        let projectTodos = [];
        let projects = [];
        let wallets = [];
        let logbookEntries = [];
        
        try { transactions = await pb.collection('transactions').getFullList(); } catch (e) { console.log('No transactions collection or empty'); }
        try { photos = await pb.collection('photos').getFullList(); } catch (e) { console.log('No photos collection or empty'); }
        try { tiers = await pb.collection('tiers').getFullList(); } catch (e) { console.log('No tiers collection or empty'); }
        try { projectAttachments = await pb.collection('project_attachments').getFullList(); } catch (e) { console.log('No project_attachments or empty'); }
        try { projectComments = await pb.collection('project_comments').getFullList(); } catch (e) { console.log('No project_comments or empty'); }
        try { projectTodos = await pb.collection('project_todos').getFullList(); } catch (e) { console.log('No project_todos or empty'); }
        try { projects = await pb.collection('projects').getFullList(); } catch (e) { console.log('No projects collection or empty'); }
        try { wallets = await pb.collection('wallets').getFullList(); } catch (e) { console.log('No wallets collection or empty'); }
        try { logbookEntries = await pb.collection('logbook').getFullList(); } catch (e) { console.log('No logbook or empty'); }
        
        const totalItems = transactions.length + photos.length + tiers.length + projectAttachments.length + projectComments.length + projectTodos.length + projects.length + wallets.length + logbookEntries.length;
        let deletedCount = 0;
        
        // 1. Delete all transactions (reference wallets, projects, tiers)
        if (transactions.length > 0) {
            this.loadingMessage = `Deleting transactions (0/${transactions.length})...`;
            this.uploadProgress = 5;
            for (let i = 0; i < transactions.length; i++) {
                try {
                    await pb.collection('transactions').delete(transactions[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete transaction:', transactions[i].id); }
                if (i % 5 === 0 || i === transactions.length - 1) {
                    this.loadingMessage = `Deleting transactions (${i + 1}/${transactions.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${transactions.length} transactions`);
        }
        
        // 2. Delete all photos (reference projects) - skip if collection doesn't exist
        if (photos.length > 0) {
            this.loadingMessage = `Deleting photos (0/${photos.length})...`;
            for (let i = 0; i < photos.length; i++) {
                try {
                    await pb.collection('photos').delete(photos[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete photo:', photos[i].id); }
                if (i % 5 === 0 || i === photos.length - 1) {
                    this.loadingMessage = `Deleting photos (${i + 1}/${photos.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${photos.length} photos`);
        }
        
        // 3. Delete all tiers (reference projects)
        if (tiers.length > 0) {
            this.loadingMessage = `Deleting tiers (0/${tiers.length})...`;
            for (let i = 0; i < tiers.length; i++) {
                try {
                    await pb.collection('tiers').delete(tiers[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete tier:', tiers[i].id); }
                if (i % 5 === 0 || i === tiers.length - 1) {
                    this.loadingMessage = `Deleting tiers (${i + 1}/${tiers.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${tiers.length} tiers`);
        }
        
        // 4. Delete all project_attachments (reference projects)
        if (projectAttachments.length > 0) {
            this.loadingMessage = `Deleting project attachments (0/${projectAttachments.length})...`;
            for (let i = 0; i < projectAttachments.length; i++) {
                try {
                    await pb.collection('project_attachments').delete(projectAttachments[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete project_attachment:', projectAttachments[i].id); }
                if (i % 5 === 0 || i === projectAttachments.length - 1) {
                    this.loadingMessage = `Deleting project attachments (${i + 1}/${projectAttachments.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${projectAttachments.length} project_attachments`);
        }
        
        // 5. Delete all project_comments (reference projects)
        if (projectComments.length > 0) {
            this.loadingMessage = `Deleting project comments (0/${projectComments.length})...`;
            for (let i = 0; i < projectComments.length; i++) {
                try {
                    await pb.collection('project_comments').delete(projectComments[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete project_comment:', projectComments[i].id); }
                if (i % 5 === 0 || i === projectComments.length - 1) {
                    this.loadingMessage = `Deleting project comments (${i + 1}/${projectComments.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${projectComments.length} project_comments`);
        }
        
        // 6. Delete all project_todos (reference projects)
        if (projectTodos.length > 0) {
            this.loadingMessage = `Deleting project todos (0/${projectTodos.length})...`;
            for (let i = 0; i < projectTodos.length; i++) {
                try {
                    await pb.collection('project_todos').delete(projectTodos[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete project_todo:', projectTodos[i].id); }
                if (i % 5 === 0 || i === projectTodos.length - 1) {
                    this.loadingMessage = `Deleting project todos (${i + 1}/${projectTodos.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${projectTodos.length} project_todos`);
        }
        
        // 7. Delete all projects
        if (projects.length > 0) {
            this.loadingMessage = `Deleting projects (0/${projects.length})...`;
            for (let i = 0; i < projects.length; i++) {
                try {
                    await pb.collection('projects').delete(projects[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete project:', projects[i].id); }
                if (i % 3 === 0 || i === projects.length - 1) {
                    this.loadingMessage = `Deleting projects (${i + 1}/${projects.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${projects.length} projects`);
        }
        
        // 8. Delete all wallets
        if (wallets.length > 0) {
            this.loadingMessage = `Deleting wallets (0/${wallets.length})...`;
            for (let i = 0; i < wallets.length; i++) {
                try {
                    await pb.collection('wallets').delete(wallets[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete wallet:', wallets[i].id); }
                this.loadingMessage = `Deleting wallets (${i + 1}/${wallets.length})...`;
                this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
            }
            console.log(`Deleted ${wallets.length} wallets`);
        }
        
        // 9. Delete all logbook entries
        if (logbookEntries.length > 0) {
            this.loadingMessage = `Deleting logbook (0/${logbookEntries.length})...`;
            for (let i = 0; i < logbookEntries.length; i++) {
                try {
                    await pb.collection('logbook').delete(logbookEntries[i].id);
                    deletedCount++;
                } catch (e) { console.warn('Could not delete logbook entry:', logbookEntries[i].id); }
                if (i % 10 === 0 || i === logbookEntries.length - 1) {
                    this.loadingMessage = `Deleting logbook (${i + 1}/${logbookEntries.length})...`;
                    this.uploadProgress = 5 + Math.round((deletedCount / Math.max(totalItems, 1)) * 80);
                }
            }
            console.log(`Deleted ${logbookEntries.length} logbook entries`);
        }
        
        // Refresh data from database
        this.loadingMessage = "Refreshing app data...";
        this.uploadProgress = 90;
        await this.fetchProjects();
        await this.fetchWallets();
        await this.fetchTransactions();
        
        // Reset risk learning model and project counter (start from project zero)
        this.loadingMessage = "Resetting risk learning model and project counter...";
        this.settings.learnedRiskBase = 1.0;
        this.settings.completedStepsCount = 0;
        this.settings.totalProjects = 0;
        if (this.settingsId) {
            try {
                await pb.collection('settings').update(this.settingsId, {
                    learnedRiskBase: 1.0,
                    completedStepsCount: 0,
                    totalProjects: 0
                });
            } catch (e) {
                console.warn('Could not reset risk learning / totalProjects settings:', e);
            }
        }
        
        // Clear local state that depends on deleted data
        this.loadingMessage = "Clearing local state...";
        this.uploadProgress = 95;
        this.proposals = [];
        this.walletDraws = {};
        this.pendingTransfers = [];
        this.activeBreakdownTier = null;
        this.selectedProject = null;
        this.modalProject = null;
        this.activeProjectGallery = null;
        this.tierHistoryData = null;
        
        // Complete
        this.uploadProgress = 100;
        this.loadingMessage = "Reset complete!";
        
        // Close modal and reset confirmation
        this.showResetDatabaseModal = false;
        this.resetConfirmationText = '';
        
        this.hideLoading();
        this.uploadProgress = 0;
        this.showNotification(
            `Database reset complete! Deleted ${projects.length} projects, ${tiers.length} tiers, ${transactions.length} transactions, ${photos.length} photos, ${projectAttachments.length} attachments, ${projectComments.length} comments, ${projectTodos.length} todos, ${wallets.length} wallets, and ${logbookEntries.length} logbook entries.`,
            "success"
        );
    } catch (error) {
        this.hideLoading();
        this.uploadProgress = 0;
        console.error('Error resetting database:', error);
        this.showNotification("Error resetting database: " + (error.message || 'Unknown error'), "error");
    }
}

export async function generateTestData() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to generate test data.", "error");
        return;
    }
    
    // Confirm action
    this.showConfirm(
        "This will delete all existing projects, tiers, transactions, photos, and wallets, then generate new test data. Continue?",
        async () => {
            await this.executeGenerateTestData();
        }
    );
}

export async function resetDatabaseSilent() {
    // Silent version of resetDatabase (no confirmation modal, used internally).
    // Only touches GM collections (transactions, photos, tiers, project_attachments, project_comments, project_todos, projects, wallets, logbook); does not touch FM collections or users.
    try {
        // Delete in order: Transactions → Photos → Tiers → project_attachments → project_comments → project_todos → Projects → Wallets → Logbook
        let transactions = [], photos = [], tiers = [], projects = [], wallets = [];
        
        // 1. Delete all transactions (reference wallets, projects, tiers)
        try {
            transactions = await pb.collection('transactions').getFullList();
            for (const tx of transactions) {
                try { await pb.collection('transactions').delete(tx.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 2. Delete all photos (reference projects)
        try {
            photos = await pb.collection('photos').getFullList();
            for (const photo of photos) {
                try { await pb.collection('photos').delete(photo.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 3. Delete all tiers (reference projects)
        try {
            tiers = await pb.collection('tiers').getFullList();
            for (const tier of tiers) {
                try { await pb.collection('tiers').delete(tier.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 4. Delete all project_attachments (reference projects)
        try {
            const atts = await pb.collection('project_attachments').getFullList();
            for (const a of atts) {
                try { await pb.collection('project_attachments').delete(a.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 5. Delete all project_comments (reference projects)
        try {
            const comments = await pb.collection('project_comments').getFullList();
            for (const c of comments) {
                try { await pb.collection('project_comments').delete(c.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 6. Delete all project_todos (reference projects)
        try {
            const todos = await pb.collection('project_todos').getFullList();
            for (const t of todos) {
                try { await pb.collection('project_todos').delete(t.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 7. Delete all projects
        try {
            projects = await pb.collection('projects').getFullList();
            for (const project of projects) {
                try { await pb.collection('projects').delete(project.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 8. Delete all wallets
        try {
            wallets = await pb.collection('wallets').getFullList();
            for (const wallet of wallets) {
                try { await pb.collection('wallets').delete(wallet.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 9. Delete all logbook entries
        try {
            const logbookEntries = await pb.collection('logbook').getFullList();
            for (const entry of logbookEntries) {
                try { await pb.collection('logbook').delete(entry.id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* collection doesn't exist */ }
        
        // 10. Reset settings.totalProjects to 0 (start from project zero)
        try {
            const settingsList = await pb.collection('settings').getFullList({ limit: 1 });
            if (settingsList.length > 0) {
                await pb.collection('settings').update(settingsList[0].id, { totalProjects: 0 });
            }
        } catch (e) { /* ignore */ }
        
        return { projects: projects.length, tiers: tiers.length, transactions: transactions.length, wallets: wallets.length, photos: photos.length };
    } catch (error) {
        throw error;
    }
}

export async function executeGenerateTestData() {
    try {
        this.uploadProgress = 0;
        this.showLoading("Resetting database and generating test data... This may take a moment");
        
        // First, delete all existing data
        this.loadingMessage = "Deleting existing data...";
        this.uploadProgress = 5;
        const deletedCounts = await this.resetDatabaseSilent();
        this.settings.totalProjects = 0; // keep in-memory in sync (silent reset already updated DB)
        console.log(`Deleted: ${deletedCounts.projects} projects, ${deletedCounts.tiers} tiers, ${deletedCounts.transactions} transactions, ${deletedCounts.wallets} wallets, ${deletedCounts.photos} photos`);
        
        // Get available category records (with IDs) - excluding virtual Scholarship category
        const availableCategories = (this.categoryRecords || []).filter(c => c.name !== 'Scholarship');
        if (availableCategories.length === 0) {
            this.hideLoading();
            this.showNotification("Please create at least one category before generating test data.", "error");
            return;
        }
        
        // Default location
        // We'll generate random coordinates within ~2km radius (approximately ±0.018 degrees)
        const baseLocation = {
            lat: 8.5131,
            lng: -81.0784
        };
        const radiusVariation = 0.018; // Approximately 2km radius
        
        // Helper function to generate random coordinates around base location
        const generateRandomCoordinates = () => {
            // Generate random angle and distance
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * radiusVariation;
            
            // Convert to lat/lng offset (rough approximation)
            const latOffset = distance * Math.cos(angle);
            const lngOffset = distance * Math.sin(angle);
            
            return {
                lat: baseLocation.lat + latOffset,
                lng: baseLocation.lng + lngOffset
            };
        };
        
        // Realistic project names
        const projectNames = [
            "Community Water Well Installation",
            "School Library Renovation",
            "Medical Supplies Distribution",
            "Rural Road Improvement",
            "Solar Panel Installation",
            "Community Garden Development",
            "Health Clinic Equipment",
            "School Computer Lab Setup",
            "Clean Water Filtration System",
            "Community Center Construction",
            "Agricultural Training Program",
            "Emergency Food Distribution",
            "Village Bridge Construction",
            "School Furniture Donation",
            "Mobile Health Clinic",
            "Irrigation System Installation",
            "Community Market Development",
            "School Playground Equipment",
            "Water Storage Tanks",
            "Rural Internet Connectivity",
            "Community Kitchen Setup",
            "School Textbooks Distribution",
            "Medical Equipment Maintenance",
            "Community Waste Management",
            "Rural Electricity Extension"
        ];
        
        // Realistic problems and interventions
        const problems = [
            "Lack of clean drinking water",
            "Inadequate educational facilities",
            "Limited access to healthcare",
            "Poor transportation infrastructure",
            "Energy poverty",
            "Food insecurity",
            "Insufficient medical equipment",
            "Outdated technology",
            "Water contamination",
            "No community gathering space",
            "Low agricultural productivity",
            "Emergency food shortage",
            "River crossing danger",
            "Damaged school furniture",
            "Remote area healthcare access",
            "Crop irrigation challenges",
            "No local market access",
            "Unsafe play area",
            "Water scarcity during dry season",
            "Digital divide",
            "Community nutrition needs",
            "Limited learning resources",
            "Medical equipment breakdown",
            "Waste disposal issues",
            "No electricity access"
        ];
        
        const interventions = [
            "Install water well with hand pump",
            "Renovate library with new books and furniture",
            "Distribute medical supplies to clinics",
            "Improve road surface and drainage",
            "Install solar panels for community",
            "Create community garden with training",
            "Provide medical equipment to health centers",
            "Set up computer lab with internet",
            "Install water filtration systems",
            "Build community center building",
            "Train farmers on modern techniques",
            "Distribute emergency food packages",
            "Construct bridge over river",
            "Donate desks, chairs, and tables",
            "Deploy mobile clinic vehicle",
            "Install irrigation canals and pumps",
            "Establish local market structure",
            "Install playground equipment",
            "Install water storage tanks",
            "Set up internet connectivity hub",
            "Establish community kitchen",
            "Distribute textbooks to schools",
            "Repair and maintain medical equipment",
            "Implement waste collection system",
            "Extend electricity grid to village"
        ];
        
        // Longer formatted descriptions (50-110 words each)
        const descriptions = [
            `<strong>Community Water Well Installation</strong><br><br>This project addresses the critical need for clean drinking water in our community. Many families currently travel long distances to access water sources that are often contaminated or unreliable. The installation of a new water well with a hand pump will provide immediate access to safe, potable water for over 200 community members. This intervention will significantly reduce waterborne diseases, especially among children, and free up valuable time for women and children who currently spend hours each day collecting water. The well will be maintained by a community water committee, ensuring long-term sustainability and local ownership of this vital resource.`,
            
            `<strong>School Library Renovation</strong><br><br>Our local school library has fallen into disrepair, with damaged furniture, outdated books, and inadequate lighting creating an environment that discourages learning. This renovation project will transform the space into a modern, welcoming learning center. We will install new bookshelves, reading tables, and chairs, along with improved lighting and ventilation systems. The project includes acquiring over 500 new books covering various subjects and reading levels, educational materials, and digital resources. This renovation will directly benefit 350 students, providing them with a proper space to study, research, and develop their reading skills, ultimately improving educational outcomes.`,
            
            `<strong>Medical Supplies Distribution</strong><br><br>Local health clinics in our region face severe shortages of essential medical supplies, limiting their ability to provide adequate healthcare services. This project will distribute critical medical supplies including bandages, antiseptics, basic medications, diagnostic equipment, and personal protective equipment to five community health centers. The supplies will enable healthcare workers to treat common illnesses, perform basic procedures, and maintain hygiene standards. This intervention will improve healthcare access for approximately 1,500 residents across multiple villages, reducing the need for expensive and time-consuming trips to distant hospitals. Regular supply distributions will be coordinated with local health authorities.`,
            
            `<strong>Rural Road Improvement</strong><br><br>The current road conditions severely limit access to markets, schools, and healthcare facilities, especially during the rainy season when roads become impassable. This project will improve approximately 3 kilometers of critical road infrastructure, including proper drainage systems, road surface grading, and installation of culverts. The improved road will enable reliable vehicle access year-round, facilitating the transport of agricultural products to markets, allowing children to attend school consistently, and ensuring emergency vehicles can reach the community. Local workers will be employed for the construction, providing income opportunities while building community ownership of the infrastructure.`,
            
            `<strong>Solar Panel Installation</strong><br><br>Energy poverty affects daily life in our community, with families relying on expensive and polluting kerosene lamps or candles for lighting after sunset. This project will install solar panel systems for 50 households, providing clean, renewable electricity for lighting, phone charging, and small appliances. Each household will receive a solar panel kit with battery storage, LED lights, and charging ports. The installation includes training for families on system maintenance and energy conservation. This intervention will improve safety through better lighting, enable children to study after dark, reduce household energy costs, and eliminate indoor air pollution from kerosene. The solar systems will be maintained by trained local technicians.`,
            
            `<strong>Community Garden Development</strong><br><br>Food insecurity and limited access to fresh vegetables affect many families in our community. This project will establish a community garden covering 2,000 square meters, providing space for 30 families to grow vegetables, herbs, and fruits. The project includes soil preparation, irrigation system installation, seeds and seedlings, gardening tools, and comprehensive training on sustainable agricultural practices. Participants will learn about crop rotation, organic pest control, and water conservation techniques. The garden will produce fresh, nutritious food for participating families while creating opportunities for surplus produce to be sold at local markets, generating additional income. Regular workshops will ensure knowledge transfer and community engagement.`,
            
            `<strong>Health Clinic Equipment</strong><br><br>Our community health clinic lacks essential medical equipment, severely limiting the quality of care that can be provided to patients. This project will equip the clinic with vital medical devices including examination tables, blood pressure monitors, stethoscopes, thermometers, scales, basic laboratory equipment, and sterilization tools. The equipment will enable healthcare workers to conduct proper patient examinations, monitor vital signs accurately, and maintain sterile conditions for procedures. This intervention will improve diagnostic capabilities and patient care quality for over 800 community members who rely on this clinic as their primary healthcare provider. Training will be provided to ensure proper equipment use and maintenance.`,
            
            `<strong>School Computer Lab Setup</strong><br><br>Students in our community lack access to modern technology and digital literacy skills, putting them at a significant disadvantage in today's digital world. This project will establish a fully equipped computer lab with 20 computers, internet connectivity, educational software, and necessary furniture. The lab will serve 400 students, providing them with opportunities to learn computer skills, conduct research, complete assignments, and develop digital literacy. Teachers will receive training on integrating technology into their curriculum. The lab will also serve as a community resource center, offering computer access and basic training to adults during evenings and weekends, bridging the digital divide in our community.`,
            
            `<strong>Clean Water Filtration System</strong><br><br>Water contamination poses serious health risks in our community, with many water sources containing harmful bacteria and pollutants. This project will install advanced water filtration systems at five strategic locations throughout the community, providing access to clean, safe drinking water for over 300 families. Each filtration unit will be capable of processing 1,000 liters per day, removing bacteria, viruses, and chemical contaminants. The systems will be maintained by trained community members, ensuring long-term operation and sustainability. This intervention will dramatically reduce waterborne diseases, improve overall community health, and eliminate the need for expensive bottled water purchases, freeing up household income for other essential needs.`,
            
            `<strong>Community Center Construction</strong><br><br>Our community lacks a dedicated space for meetings, events, and social gatherings, limiting our ability to come together for important discussions and celebrations. This project will construct a 200-square-meter community center building with a main hall, storage area, and basic kitchen facilities. The center will serve as a venue for community meetings, educational workshops, cultural events, and social activities. It will also function as an emergency shelter during natural disasters. Local construction workers will be employed, and community members will contribute labor, creating a sense of ownership and pride. The center will be managed by a community committee, ensuring it serves the needs of all residents and remains well-maintained for future generations.`,
            
            `<strong>Agricultural Training Program</strong><br><br>Farmers in our community struggle with low crop yields and outdated farming techniques, limiting their income and food production capacity. This comprehensive training program will provide 50 farmers with modern agricultural knowledge and skills through hands-on workshops and field demonstrations. Topics covered include soil management, crop rotation, pest control, irrigation techniques, and post-harvest handling. The program includes distribution of improved seeds, organic fertilizers, and basic farming tools. Participants will learn sustainable farming practices that increase yields while protecting the environment. The training will be conducted by agricultural experts and experienced local farmers, ensuring knowledge transfer and peer learning. This intervention will improve food security and increase agricultural income for participating families.`,
            
            `<strong>Emergency Food Distribution</strong><br><br>During times of crisis, such as natural disasters or economic hardship, many families in our community face severe food shortages. This project establishes an emergency food distribution system to provide immediate relief to vulnerable families. The program includes establishing a food storage facility, procuring non-perishable food items, and creating a distribution network. Food packages will contain rice, beans, cooking oil, salt, and other essential staples sufficient to feed a family for two weeks. The system will be activated during emergencies and will prioritize families with children, elderly members, and those facing extreme poverty. Community volunteers will manage distribution, ensuring efficient and fair allocation of resources to those most in need during difficult times.`,
            
            `<strong>Village Bridge Construction</strong><br><br>A dangerous river crossing currently separates our community from essential services, markets, and neighboring villages. During the rainy season, the crossing becomes completely impassable, isolating the community for weeks at a time. This project will construct a 25-meter pedestrian and light vehicle bridge over the river, providing safe, year-round access. The bridge will be built using durable materials designed to withstand flooding and heavy use. This infrastructure will enable reliable access to healthcare facilities, schools, and markets regardless of weather conditions. The bridge will also facilitate emergency vehicle access, improving community safety. Local workers will be trained and employed during construction, and a maintenance plan will ensure the bridge remains safe and functional for decades to come.`,
            
            `<strong>School Furniture Donation</strong><br><br>Many classrooms in our school have damaged or missing furniture, forcing students to sit on the floor or share broken desks and chairs. This creates an uncomfortable learning environment that hinders student concentration and academic performance. This project will provide new furniture for 15 classrooms, including desks, chairs, teacher desks, and storage cabinets. The furniture will be durable, ergonomically designed, and sized appropriately for different age groups. This intervention will directly benefit 450 students, providing them with proper seating and workspace that enables better focus and learning. The improved classroom environment will also boost teacher morale and create a more professional educational setting that demonstrates the value placed on education in our community.`,
            
            `<strong>Mobile Health Clinic</strong><br><br>Remote areas of our region lack access to healthcare services, with the nearest clinic being hours away by foot. This project will deploy a mobile health clinic vehicle equipped with basic medical equipment and supplies, bringing healthcare services directly to isolated communities. The mobile clinic will visit five remote villages on a rotating schedule, providing basic medical consultations, health screenings, vaccinations, and health education. A trained healthcare worker will operate the clinic, treating common illnesses, monitoring chronic conditions, and referring serious cases to hospitals. This intervention will improve healthcare access for approximately 600 residents in remote areas, reducing travel time and costs while ensuring timely medical attention. The mobile clinic will also serve as an emergency response vehicle when needed.`,
            
            `<strong>Irrigation System Installation</strong><br><br>Farmers struggle with inconsistent water availability, especially during dry seasons, leading to crop failures and reduced agricultural productivity. This project will install a comprehensive irrigation system covering 50 hectares of farmland, including water pumps, pipelines, and distribution channels. The system will draw water from a reliable source and distribute it efficiently to multiple farms. Farmers will receive training on irrigation management and water conservation techniques. This intervention will enable year-round crop production, increase yields by an estimated 40%, and allow farmers to grow higher-value crops. The improved water access will also reduce the time and labor required for manual watering, freeing up resources for other agricultural activities. A water management committee will ensure fair distribution and system maintenance.`,
            
            `<strong>Community Market Development</strong><br><br>Local producers lack a proper venue to sell their goods, forcing them to travel long distances to reach markets or sell at suboptimal prices. This project will establish a community market structure with covered stalls, storage facilities, and basic amenities. The market will provide space for 30 vendors to sell agricultural products, crafts, and other goods. The facility will include proper drainage, lighting, and security features. This intervention will create a local economic hub, enabling producers to sell directly to community members and visitors, reducing transportation costs and increasing profit margins. The market will operate weekly and during special events, becoming a social gathering place while stimulating local economic activity. Vendors will pay minimal fees to cover maintenance costs.`,
            
            `<strong>School Playground Equipment</strong><br><br>Our school lacks safe, age-appropriate playground equipment, limiting children's opportunities for physical activity and play during recess. This project will install a complete playground system including swings, slides, climbing structures, and sports equipment suitable for different age groups. The equipment will be made from durable, weather-resistant materials and installed with proper safety surfacing. This intervention will benefit 400 students, providing them with opportunities for physical exercise, social interaction, and creative play. Regular physical activity improves children's health, concentration, and academic performance. The playground will also serve as a community space after school hours, allowing local children to engage in safe recreational activities. A maintenance plan will ensure equipment remains safe and functional for years to come.`,
            
            `<strong>Water Storage Tanks</strong><br><br>During the dry season, water scarcity becomes a critical issue, with many families experiencing severe water shortages. This project will install large-capacity water storage tanks at strategic locations throughout the community, capable of storing rainwater collected during the wet season. The system includes collection infrastructure, filtration systems, and distribution points. Each tank will hold 10,000 liters, providing a reliable water reserve for approximately 50 families during dry periods. This intervention will ensure continuous water availability year-round, reducing the impact of seasonal droughts and eliminating the need for expensive water purchases. Community members will be trained on water conservation and tank maintenance, ensuring the system's long-term sustainability and proper management of this vital resource.`,
            
            `<strong>Rural Internet Connectivity</strong><br><br>Our community is isolated from the digital world, with no reliable internet access limiting educational opportunities, communication, and economic possibilities. This project will establish an internet connectivity hub with Wi-Fi coverage for the community center and surrounding area. The system includes satellite or wireless internet connection, routers, and necessary infrastructure. The hub will provide free internet access during designated hours, enabling students to complete online assignments, community members to access information and services, and local businesses to connect with broader markets. Training sessions will teach basic internet skills and digital literacy. This intervention will bridge the digital divide, opening up new opportunities for education, communication, and economic development while connecting our community to the wider world.`,
            
            `<strong>Community Kitchen Setup</strong><br><br>Many families struggle with food preparation due to lack of proper cooking facilities and limited access to nutritious meals. This project will establish a community kitchen facility equipped with modern cooking equipment, storage areas, and dining space. The kitchen will serve nutritious meals to children, elderly residents, and families in need, operating during weekdays and special community events. Volunteers will be trained in food safety, nutrition, and meal preparation. The facility will also serve as a training center for cooking and nutrition education workshops. This intervention will improve food security, provide balanced nutrition to vulnerable community members, and create a social gathering space that strengthens community bonds. The kitchen will source ingredients locally when possible, supporting local farmers while providing fresh, healthy meals.`,
            
            `<strong>School Textbooks Distribution</strong><br><br>Students lack access to current textbooks and learning materials, forcing them to share outdated books or learn without proper resources. This project will provide new textbooks covering core subjects for all grade levels, along with supplementary reading materials and educational resources. Each student will receive their own set of textbooks, eliminating the need for sharing and ensuring consistent access to learning materials. The distribution includes teacher guides and reference materials to support effective instruction. This intervention will directly benefit 400 students, improving their ability to study independently, complete homework assignments, and prepare for exams. The new textbooks will align with current curriculum standards and include updated information, ensuring students receive quality education that prepares them for further studies and future opportunities.`,
            
            `<strong>Medical Equipment Maintenance</strong><br><br>Existing medical equipment in our health clinic has fallen into disrepair due to lack of maintenance and technical support, rendering much of it unusable. This project will repair and refurbish essential medical equipment including examination tables, diagnostic devices, and sterilization equipment. The project includes replacement of broken parts, calibration of instruments, and comprehensive maintenance to restore full functionality. Technical experts will conduct repairs and train local staff on proper equipment care and basic troubleshooting. This intervention will restore critical healthcare capabilities, enabling the clinic to serve patients more effectively and safely. The maintenance program will include ongoing support and regular check-ups to prevent future equipment failures, ensuring reliable healthcare services for the 800 community members who depend on this facility.`,
            
            `<strong>Community Waste Management</strong><br><br>Improper waste disposal creates health hazards and environmental problems throughout our community, with garbage accumulating in public spaces and contaminating water sources. This project will implement a comprehensive waste management system including waste collection infrastructure, designated disposal sites, recycling programs, and community education. The system includes distribution of waste bins, establishment of collection routes, and training of waste management workers. Community members will receive education on waste reduction, recycling, and proper disposal practices. This intervention will improve public health by reducing disease vectors, protect the environment by preventing contamination, and create employment opportunities for waste collection workers. The program will establish sustainable practices that can be maintained long-term, transforming waste management from a problem into a community-managed service that benefits everyone.`,
            
            `<strong>Rural Electricity Extension</strong><br><br>Our village remains without access to the electrical grid, forcing families to rely on expensive and unreliable alternatives like generators or battery-powered devices. This project will extend the national electricity grid to our community, providing reliable electrical service to 100 households. The project includes installation of power lines, transformers, and connection infrastructure, along with household electrical installations and safety equipment. This intervention will transform daily life, enabling families to use electric lighting, appliances, and devices that improve quality of life and productivity. Children will be able to study after dark, businesses can operate more efficiently, and the community will have access to modern conveniences. The electrical connection will also enable future development projects and economic opportunities that depend on reliable power supply, opening new possibilities for community growth and prosperity.`
        ];
        
        const projects = [];
        const allTiers = [];
        let totalCost = 0;
        const totalProjects = 25;
        
        // Realistic scoring profiles for each project type
        // Each profile: { u: urgency 1-10, b: breadth 1-5, d: depth 1-5, n: neglectedness 1-5, k: confidence 0.6-1.0, emergency: bool, externalDep: bool, estDays: number }
        const scoringProfiles = [
            // 0: Community Water Well - high impact, many benefit, life-changing
            { u: 8, b: 4, d: 5, n: 4, k: 0.85, emergency: false, externalDep: false, estDays: 21 },
            // 1: School Library Renovation - medium urgency, education focus
            { u: 5, b: 3, d: 3, n: 2, k: 0.90, emergency: false, externalDep: false, estDays: 30 },
            // 2: Medical Supplies Distribution - urgent healthcare
            { u: 8, b: 4, d: 4, n: 3, k: 0.95, emergency: false, externalDep: false, estDays: 7 },
            // 3: Rural Road Improvement - infrastructure, external dependency
            { u: 6, b: 4, d: 3, n: 3, k: 0.70, emergency: false, externalDep: true, estDays: 60 },
            // 4: Solar Panel Installation - strategic, technical
            { u: 5, b: 3, d: 4, n: 3, k: 0.80, emergency: false, externalDep: true, estDays: 14 },
            // 5: Community Garden - food security, community building
            { u: 6, b: 3, d: 3, n: 3, k: 0.90, emergency: false, externalDep: false, estDays: 45 },
            // 6: Health Clinic Equipment - critical healthcare
            { u: 8, b: 4, d: 4, n: 4, k: 0.85, emergency: false, externalDep: false, estDays: 14 },
            // 7: School Computer Lab - education, technology
            { u: 4, b: 3, d: 3, n: 2, k: 0.80, emergency: false, externalDep: true, estDays: 21 },
            // 8: Clean Water Filtration - critical health
            { u: 9, b: 4, d: 5, n: 4, k: 0.85, emergency: false, externalDep: false, estDays: 14 },
            // 9: Community Center Construction - large project
            { u: 4, b: 5, d: 3, n: 3, k: 0.70, emergency: false, externalDep: true, estDays: 90 },
            // 10: Agricultural Training - capacity building
            { u: 5, b: 3, d: 3, n: 3, k: 0.90, emergency: false, externalDep: false, estDays: 30 },
            // 11: Emergency Food Distribution - EMERGENCY
            { u: 10, b: 4, d: 5, n: 5, k: 0.95, emergency: true, externalDep: false, estDays: 3 },
            // 12: Village Bridge Construction - critical infrastructure
            { u: 8, b: 4, d: 5, n: 4, k: 0.70, emergency: false, externalDep: true, estDays: 45 },
            // 13: School Furniture - education basics
            { u: 5, b: 3, d: 2, n: 2, k: 0.95, emergency: false, externalDep: false, estDays: 14 },
            // 14: Mobile Health Clinic - remote healthcare
            { u: 8, b: 3, d: 4, n: 4, k: 0.75, emergency: false, externalDep: true, estDays: 30 },
            // 15: Irrigation System - agriculture, complex
            { u: 6, b: 3, d: 4, n: 3, k: 0.70, emergency: false, externalDep: true, estDays: 45 },
            // 16: Community Market - economic development
            { u: 5, b: 4, d: 3, n: 3, k: 0.80, emergency: false, externalDep: false, estDays: 60 },
            // 17: School Playground - children wellbeing
            { u: 3, b: 3, d: 2, n: 2, k: 0.90, emergency: false, externalDep: false, estDays: 21 },
            // 18: Water Storage Tanks - water security
            { u: 7, b: 4, d: 4, n: 4, k: 0.85, emergency: false, externalDep: false, estDays: 21 },
            // 19: Rural Internet - connectivity, external
            { u: 4, b: 3, d: 3, n: 3, k: 0.65, emergency: false, externalDep: true, estDays: 30 },
            // 20: Community Kitchen - nutrition, social
            { u: 6, b: 3, d: 3, n: 3, k: 0.85, emergency: false, externalDep: false, estDays: 30 },
            // 21: School Textbooks - education essentials
            { u: 6, b: 3, d: 3, n: 2, k: 0.95, emergency: false, externalDep: false, estDays: 7 },
            // 22: Medical Equipment Maintenance - healthcare
            { u: 7, b: 3, d: 3, n: 4, k: 0.80, emergency: false, externalDep: false, estDays: 14 },
            // 23: Waste Management - public health
            { u: 6, b: 4, d: 3, n: 3, k: 0.80, emergency: false, externalDep: false, estDays: 45 },
            // 24: Rural Electricity Extension - major infrastructure
            { u: 7, b: 4, d: 4, n: 4, k: 0.60, emergency: false, externalDep: true, estDays: 90 }
        ];
        
        // Generate 25 fresh backlog projects (all pending, no allocations, no funding)
        this.loadingMessage = "Creating projects...";
        this.uploadProgress = 10;
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const now = new Date();
        
        for (let i = 0; i < totalProjects; i++) {
            // Update progress: 10% to 30% for projects
            this.uploadProgress = 10 + Math.floor((i / totalProjects) * 20);
            this.loadingMessage = `Creating project ${i + 1} of ${totalProjects}...`;
            const numTiers = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 tiers
            
            // Each project should have only ONE category (relation ID)
            // availableCategories contains category objects with id property
            const shuffled = [...availableCategories].sort(() => 0.5 - Math.random());
            const projectCategoryId = shuffled[0]?.id || null; // Get the category ID for relation
            
            // Generate random date between 1 year ago and now
            const randomTime = oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime());
            const randomDate = new Date(randomTime);
            
            // Generate random coordinates for this project
            const projectCoordinates = generateRandomCoordinates();
            
            // Use project index for content (we have exactly 25 projects and 25 content items)
            const contentIndex = i;
            const profile = scoringProfiles[i];
            
            const projectData = {
                title: projectNames[contentIndex],
                description: descriptions[contentIndex],
                type: 'project',
                category: projectCategoryId, // Single relation to categories collection
                coordinates: JSON.stringify(projectCoordinates),
                // Scholarship fields (null for regular projects)
                scholarshipValue: null,
                scholarshipStartDate: null,
                scholarshipEndDate: null,
                scholarshipFeedback: null,
                scholarshipFixedCost: null
            };
            
            const createdProject = await pb.collection('projects').create(projectData);
            
            // Update the created field with random date
            try {
                await pb.collection('projects').update(createdProject.id, {
                    created: randomDate.toISOString()
                });
                createdProject.created = randomDate.toISOString();
            } catch (e) {
                console.warn('Could not update created date for project:', createdProject.id, e);
            }
            
            projects.push(createdProject);
            
            // Generate tiers for this project with NEW SCORING PARAMETERS
            this.loadingMessage = `Creating tiers for project ${i + 1}...`;
            
            for (let tierLevel = 1; tierLevel <= numTiers; tierLevel++) {
                // Scoring decreases slightly for later tiers (less urgent as project progresses)
                const tierUrgency = Math.max(1, profile.u - (tierLevel - 1));
                const tierDepth = Math.max(1, profile.d - Math.floor((tierLevel - 1) * 0.5));
                
                // Vary confidence and estDays per tier
                const tierConfidence = Math.max(0.6, profile.k - (tierLevel - 1) * 0.05);
                const tierEstDays = Math.round(profile.estDays / numTiers * (1 + (tierLevel - 1) * 0.2));
                
                const tierIntervention = tierLevel === 1 
                    ? interventions[contentIndex] 
                    : `${interventions[contentIndex]} - Stage ${tierLevel}`;
                
                // Generate monetary costs using dynamic cost types
                const baseCost = Math.floor(Math.random() * 2000) + 200; // $200-$2200 base
                const monetaryCosts = {};
                
                // Distribute costs across available cost types
                if (this.costTypes && this.costTypes.length > 0) {
                    const remainingPercent = [0.4, 0.3, 0.2, 0.1];
                    let remaining = baseCost;
                    this.costTypes.forEach((ct, idx) => {
                        if (idx < this.costTypes.length - 1) {
                            const amount = Math.floor(baseCost * (remainingPercent[idx] || 0.1));
                            monetaryCosts[ct.id] = amount;
                            remaining -= amount;
                        } else {
                            monetaryCosts[ct.id] = remaining; // Last one gets remainder
                        }
                    });
                } else {
                    // Fallback if no cost types
                    monetaryCosts['default'] = baseCost;
                }
                
                // Generate in-kind labor (NGO work) - varies by project type
                const hasInkindLabor = Math.random() > 0.3; // 70% have in-kind labor
                const inkindPeople = hasInkindLabor ? Math.floor(Math.random() * 4) + 1 : 0; // 1-4 people
                const inkindHours = hasInkindLabor ? Math.floor(Math.random() * 16) + 8 : 0; // 8-24 hours
                const inkindRate = hasInkindLabor ? Math.floor(Math.random() * 8) + 8 : 0; // $8-$15/hr
                
                // Generate community labor - varies by project type
                const hasCommunityLabor = Math.random() > 0.5; // 50% have community labor
                const communityPeople = hasCommunityLabor ? Math.floor(Math.random() * 6) + 2 : 0; // 2-7 people
                const communityHours = hasCommunityLabor ? Math.floor(Math.random() * 12) + 4 : 0; // 4-16 hours
                const communityRate = hasCommunityLabor ? Math.floor(Math.random() * 3) + 3 : 0; // $3-$5/hr
                
                totalCost += baseCost + (inkindPeople * inkindHours * inkindRate) + (communityPeople * communityHours * communityRate);
                
                // ALL TIERS ARE FRESH - backlog status, no allocations
                const tierData = {
                    project: createdProject.id,
                    level: tierLevel,
                    intervention: tierIntervention,
                    // Scoring fields
                    u: tierUrgency,
                    b: profile.b,
                    d: tierDepth,
                    n: profile.n,
                    k: tierConfidence,
                    emergency: profile.emergency && tierLevel === 1, // Only first tier is emergency
                    externalDependency: profile.externalDep,
                    estDays: tierEstDays,
                    // Legacy field for backwards compatibility
                    utility: tierUrgency,
                    // Monetary costs (JSON object keyed by cost_type IDs)
                    monetaryCosts: JSON.stringify(monetaryCosts),
                    // In-kind labor (NGO work)
                    inkindPeople: inkindPeople,
                    inkindHours: inkindHours,
                    inkindRate: inkindRate,
                    // Community labor
                    communityPeople: communityPeople,
                    communityHours: communityHours,
                    communityRate: communityRate,
                    // Status
                    status: 'backlog',
                    allocatedMonetaryCost: 0,
                    // Wallet relation (null until started)
                    wallet: null,
                    // Completion tracking (null until started/completed)
                    startedAt: null,
                    completedAt: null,
                    actualDays: null,
                    riskEstAtStart: null,
                    scoreAtStart: null,
                    riskFinal: null,
                    scoreFinal: null,
                    // Verified values (null until completed)
                    verifiedMonetaryCosts: null,
                    verifiedInkindPeople: null,
                    verifiedInkindHours: null,
                    verifiedInkindRate: null,
                    verifiedCommunityPeople: null,
                    verifiedCommunityHours: null,
                    verifiedCommunityRate: null,
                    // Proof
                    proof: null
                };
                
                const createdTier = await pb.collection('tiers').create(tierData);
                allTiers.push(createdTier);
            }
            // Update progress after each project's tiers are created
            // Projects: 10-30%, Tiers: 30-60% (estimate ~50 tiers total)
            const totalTiersCreated = allTiers.length;
            const estimatedTotalTiers = 50; // Rough estimate
            this.uploadProgress = 30 + Math.min(Math.floor((totalTiersCreated / estimatedTotalTiers) * 30), 30);
        }
        
        // Calculate wallet balances (120% of total cost, split across 3 wallets)
        this.loadingMessage = "Creating wallets...";
        this.uploadProgress = 60;
        const totalWalletBalance = Math.floor(totalCost * 1.2);
        const walletBalances = [
            Math.floor(totalWalletBalance * 0.4), // 40%
            Math.floor(totalWalletBalance * 0.35), // 35%
            totalWalletBalance - Math.floor(totalWalletBalance * 0.4) - Math.floor(totalWalletBalance * 0.35) // 25% (remainder)
        ];
        
        const walletNames = ["Banco General", "Emergency Reserve", "Community Donations"];
        const wallets = [];
        
        // Create 3 wallets
        for (let i = 0; i < 3; i++) {
            this.loadingMessage = `Creating wallet ${i + 1} of 3...`;
            this.uploadProgress = 60 + Math.floor((i / 3) * 5);
            const walletData = {
                name: walletNames[i],
                balance: walletBalances[i]
            };
            const createdWallet = await pb.collection('wallets').create(walletData);
            wallets.push(createdWallet);
            
        // Create deposit transaction for each wallet (with varied dates)
        this.loadingMessage = `Creating transaction ${i + 1} of 3...`;
        // Deposits happened 6-12 months ago
        const depositDate = new Date(oneYearAgo);
        depositDate.setMonth(depositDate.getMonth() + Math.floor(Math.random() * 6));
        await pb.collection('transactions').create({
            date: depositDate.toISOString(),
            type: 'DEPOSIT',
            amount: walletBalances[i],
            description: `Initial deposit - ${walletNames[i]}`,
            wallet: createdWallet.id,
            details: null,
            sources: null
        });
        }
        
        // Refresh data
        this.loadingMessage = "Refreshing data...";
        this.uploadProgress = 70;
        await this.fetchProjects();
        this.uploadProgress = 80;
        await this.fetchWallets();
        this.uploadProgress = 90;
        await this.fetchTransactions();
        this.uploadProgress = 100;
        
        this.uploadProgress = 0; // Reset progress
        this.hideLoading();
        this.showNotification(
            `Test data generated! Created ${projects.length} projects with ${allTiers.length} steps (new scoring: U/B/D/N/K, flags, estDays), ${wallets.length} wallets. Ready for testing!`,
            "success"
        );
    } catch (error) {
        this.uploadProgress = 0; // Reset progress on error
        this.hideLoading();
        console.error('Error generating test data:', error);
        this.showNotification("Error generating test data: " + (error.message || 'Unknown error'), "error");
    }
}
