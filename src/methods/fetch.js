/**
 * PocketBase Data Fetching Methods
 * ~950 lines
 */
import { pb, collectionIdCache } from '../config.js'

// ========== POCKETBASE DATA FETCHING ==========
export async function fetchCoreData() {
    await this.fetchSettings();
    await Promise.all([
        this.fetchCategories(),
        this.fetchCostTypes()
    ]);
    await this.fetchProjects();
    this.animateHeroNumbers();
}

export async function fetchAllData() {
    await this.fetchCoreData();
    await Promise.all([
        this.fetchWallets(),
        this.fetchTransactions()
    ]);
    this._walletsLoaded = true;
    this._transactionsLoaded = true;
    await this.fetchFmGmWallets();
    await this.fetchBudgetFeed();
    this._budgetFeedLoaded = true;
    await this.fetchDonors();
    this.fetchDonorLaborLogs();
    this._donorsLoaded = true;
}

export async function ensureViewData(view) {
    const needed = [];
    if ((view === 'wallets' || view === 'new_operation' || view === 'stats') && !this._walletsLoaded) {
        needed.push(this.fetchWallets().then(() => { this._walletsLoaded = true; }));
    }
    if ((view === 'new_operation' || view === 'stats') && !this._transactionsLoaded) {
        needed.push(this.fetchTransactions().then(() => { this._transactionsLoaded = true; }));
    }
    if ((view === 'wallets' || view === 'stats') && !this._budgetFeedLoaded) {
        needed.push(
            this.fetchFmGmWallets()
                .then(() => this.fetchBudgetFeed())
                .then(() => { this._budgetFeedLoaded = true; })
        );
    }
    if ((view === 'donors' || view === 'stats') && !this._donorsLoaded) {
        needed.push(
            this.fetchDonors()
                .then(() => this.fetchDonorLaborLogs())
                .then(() => { this._donorsLoaded = true; })
        );
    }
    if (needed.length > 0) {
        this.viewDataLoading = true;
        await Promise.all(needed);
        this.viewDataLoading = false;
    }
}

// NEW: Fetch cost types (configurable in settings)
export async function fetchCostTypes() {
    try {
        const records = await pb.collection('cost_types').getFullList({ 
            sort: 'order'
        });
        this.costTypes = records;
        console.log('Fetched cost types:', this.costTypes.length);
    } catch (e) {
        console.error('Error fetching cost types:', e);
        this.costTypes = [];
    }
}

export async function fetchProjects() {
    try {
        // Get collection ID for tiers (needed for file URLs)
        if (!collectionIdCache.tiers && this.isAuthenticated) {
            try {
                const collection = await pb.collections.getOne('tiers');
                collectionIdCache.tiers = collection.id;
                console.log('Tiers collection ID:', collection.id);
            } catch (e) {
                // Silently fail
            }
        }
        
        // Fetch projects with expanded category relation
        let records;
        try {
            records = await pb.collection('projects').getFullList({
                sort: '-created',
                expand: 'category,mainPhoto'
            });
        } catch (expandError) {
            console.warn('Failed to expand category/mainPhoto, fetching without expand:', expandError);
            records = await pb.collection('projects').getFullList({
                sort: '-created'
            });
        }
        console.log('Fetched projects:', records.length);

        // Fetch all tiers separately and group by project
        const allTiers = await pb.collection('tiers').getFullList({
            sort: 'level'
        });
        console.log('Fetched tiers:', allTiers.length);

        // Group tiers by project ID
        const tiersByProject = {};
        allTiers.forEach(tier => {
            const projectId = tier.project;
            if (!tiersByProject[projectId]) {
                tiersByProject[projectId] = [];
            }
            tiersByProject[projectId].push({
                ...tier,
                // Parse JSON fields
                monetaryCosts: typeof tier.monetaryCosts === 'string' ? JSON.parse(tier.monetaryCosts) : (tier.monetaryCosts || {}),
                verifiedMonetaryCosts: typeof tier.verifiedMonetaryCosts === 'string' ? JSON.parse(tier.verifiedMonetaryCosts) : (tier.verifiedMonetaryCosts || {}),
                // Proof for file URLs
                proof: tier.proof || null,
                collectionId: collectionIdCache.tiers || null,
                // Default status to 'backlog' if not set
                status: tier.status || 'backlog'
            });
        });

        // Map projects with their tiers (photo counts deferred to fetchPhotoCountsForProjects)
        this.projects = records.map(r => {
            let categoryObj = null;
            let categoryName = null;
            if (r.expand && r.expand.category) {
                categoryObj = r.expand.category;
                categoryName = categoryObj.name;
            }
            
            return {
                ...r,
                tiers: tiersByProject[r.id] || [],
                categoryObj: categoryObj,
                categoryName: categoryName,
                categories: categoryName ? [categoryName] : [],
                coordinates: typeof r.coordinates === 'string' ? JSON.parse(r.coordinates) : (r.coordinates || null),
                photos: r.photos || [],
                mainPhoto: r.expand && r.expand.mainPhoto ? r.expand.mainPhoto : (r.mainPhoto || null),
                _photoCountCache: 0
            };
        });
        
        this.projectsLoading = false;
        console.log('Mapped projects with tiers:', this.projects.length);

        // Update map markers if map is visible
        if (this.showMap && this.mapInstance) {
            this.$nextTick(() => {
                this.updateMapMarkers();
            });
        }
    } catch (e) {
        console.error('Error fetching projects:', e);
        this.projectsLoading = false;
        if (e.status === 0 || e.message?.includes('Failed to fetch') || e.message?.includes('ERR_CONNECTION_REFUSED')) {
            this.showNotification("Cannot connect to server. Please check your connection and ensure PocketBase is running.", "error", 5000);
            this.projects = [];
        } else {
            this.showNotification("Error loading projects: " + (e.message || 'Unknown error'), "error");
        }
    }
}

export async function fetchPhotoCountsForProjects() {
    if (this._photoCountsLoaded || !this.projects.length) return;
    try {
        const projectIds = this.projects.map(r => r.id);
        const orFilter = projectIds.map(id => `project = "${id}"`).join(' || ');
        const allPhotos = await pb.collection('photos').getFullList({ filter: orFilter });
        const counts = {};
        allPhotos.forEach(ph => {
            const pid = typeof ph.project === 'string' ? ph.project : (ph.project?.id ?? ph.project);
            if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });
        this.projects.forEach(p => { p._photoCountCache = counts[p.id] || 0; });
        this._photoCountsLoaded = true;
        console.log('Photo counts loaded for', Object.keys(counts).length, 'projects');
    } catch (e) {
        console.warn('Could not fetch photo counts:', e);
    }
}

export async function fetchWallets() {
    try {
        this.wallets = await pb.collection('wallets').getFullList({ sort: 'name' });
    } catch (e) {
        console.error('Error fetching wallets:', e);
        // Handle connection errors gracefully
        if (e.status === 0 || e.message?.includes('Failed to fetch') || e.message?.includes('ERR_CONNECTION_REFUSED')) {
            // Connection error - already handled in fetchProjects, just set empty array
            this.wallets = [];
        } else if (e.status !== 404) {
            // Only show notification for unexpected errors, not empty database
            this.showNotification("Error loading wallets: " + (e.message || 'Unknown error'), "error");
        }
        this.wallets = [];
    }
}

function mapTransaction(tx) {
    return {
        ...tx,
        details: typeof tx.details === 'string' ? JSON.parse(tx.details) : (tx.details || null),
        walletId: tx.wallet || null
    };
}

export async function fetchTransactions() {
    try {
        const perPage = 50;
        const result = await pb.collection('transactions').getList(1, perPage, {
            sort: '-date',
            expand: 'wallet,project,tier'
        });
        this.transactions = result.items.map(mapTransaction);
        this.transactionsPage = result.page;
        this.transactionsTotalPages = result.totalPages;
        this.transactionsTotalItems = result.totalItems;
        console.log('Fetched transactions page 1:', result.items.length, '/', result.totalItems);
    } catch (e) {
        console.error('Error fetching transactions:', e);
        this.transactions = [];
    }
}

export async function loadMoreTransactions() {
    if (this.transactionsPage >= this.transactionsTotalPages || this.transactionsLoadingMore) return;
    this.transactionsLoadingMore = true;
    try {
        const nextPage = this.transactionsPage + 1;
        const result = await pb.collection('transactions').getList(nextPage, 50, {
            sort: '-date',
            expand: 'wallet,project,tier'
        });
        this.transactions = this.transactions.concat(result.items.map(mapTransaction));
        this.transactionsPage = result.page;
        this.transactionsTotalPages = result.totalPages;
    } catch (e) {
        console.error('Error loading more transactions:', e);
    }
    this.transactionsLoadingMore = false;
}

/** Budget page: fetch FM GM-wallets (is_gm_wallet = true). */
export async function fetchFmGmWallets() {
    try {
        const list = await pb.collection('fm_wallets').getFullList({
            filter: 'is_gm_wallet = true',
            sort: 'name'
        });
        this.fmGmWallets = list;
    } catch (e) {
        console.error('Error fetching FM GM wallets:', e);
        this.fmGmWallets = [];
    }
}

/** Budget page: combined feed of fm_transactions (all GM-wallets) + gm_budget_events. Call after fetchFmGmWallets. */
function mapFmTx(tx, walletNames, $t) {
    const tier = tx.expand?.gm_tier;
    const project = tier?.expand?.project ?? tier;
    const stepLevel = tier?.level ?? '';
    const projectTitle = project?.title ?? '';
    const gmCategoryLabel = (project?.expand?.category?.name ?? project?.categoryName ?? '');
    const isTransferTx = tx.is_transfer === true;
    const isDonationTx = tx.expand?.category?.is_donation === true;
    const isBareTransfer = isTransferTx && !isDonationTx;
    const donorName = tx.donor_name || '';
    let stepDescription;
    if (isDonationTx) {
        stepDescription = donorName ? $t('common.donation_received_by', { donor: donorName }) : $t('common.donation_received');
    } else if (isBareTransfer) {
        const linkedWalletId = tx.expand?.linked_transaction?.wallet || tx.linked_transaction_wallet;
        const linkedWalletName = walletNames[linkedWalletId] || '—';
        const amt = Number(tx.amount) || 0;
        stepDescription = amt < 0
            ? $t('common.transfer_to', { wallet: linkedWalletName })
            : $t('common.transfer_from', { wallet: linkedWalletName });
    } else if (gmCategoryLabel && stepLevel && projectTitle) {
        stepDescription = $t('common.spent_for_step', { step: stepLevel, project: projectTitle });
    } else {
        stepDescription = tx.description || (tx.expand?.category?.name ? $t('common.expense_label', { name: tx.expand.category.name }) : $t('common.transaction'));
    }
    const cat = project?.expand?.category;
    const gmCategoryColor = (cat?.color && /^#([0-9a-fA-F]{3}){1,2}$/.test(cat.color)) ? cat.color : null;
    return {
        id: tx.id,
        date: tx.date || tx.created,
        created: tx.created,
        walletId: tx.wallet,
        walletName: walletNames[tx.wallet] || '—',
        type: tx.type || 'expense',
        amount: Number(tx.amount) || 0,
        description: stepDescription,
        categoryIcon: tx.expand?.category?.icon || null,
        categoryColor: tx.expand?.category?.color || null,
        categoryName: tx.expand?.category?.name || null,
        gmCategoryLabel: gmCategoryLabel || null,
        gmCategoryColor: gmCategoryColor || null,
        stepDescription,
        projectId: project?.id || null,
        projectTitle: project?.title || null,
        isDonation: isDonationTx,
        isTransfer: isBareTransfer,
        isInternalTransfer: false,
        linkedTransactionId: tx.linked_transaction || null,
        donorName: donorName || null,
        receipts: tx.receipt || null,
        _fmTxRecord: isDonationTx ? tx : null,
        _isBudgetEvent: false
    };
}

function mapBudgetEvent(ev, $t) {
    const tier = ev.expand?.tier;
    const projectTitle = tier?.expand?.project?.title ?? '—';
    const stepLevel = tier?.level ?? '—';
    const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let description;
    if (ev.event_type === 'allocation') {
        description = $t('common.budget_allocated', { amount: fmt(Math.abs(Number(ev.amount) || 0)), step: stepLevel, project: projectTitle });
    } else if (ev.event_type === 'project_completion') {
        const diff = Number(ev.amount) || 0;
        if (diff > 0) description = $t('common.budget_completed_under', { step: stepLevel, project: projectTitle, amount: fmt(diff) });
        else if (diff < 0) description = $t('common.budget_completed_over', { step: stepLevel, project: projectTitle, amount: fmt(-diff) });
        else description = $t('common.budget_completed_exact', { step: stepLevel, project: projectTitle });
    } else {
        description = ev.details || $t('common.budget_event');
    }
    return {
        id: ev.id, date: ev.created, created: ev.created, walletId: null, walletName: '—',
        type: ev.event_type === 'allocation' ? 'ALLOCATION' : 'PROJECT_COMPLETION',
        event_type: ev.event_type, amount: Number(ev.amount) || 0, description,
        projectId: tier?.expand?.project?.id || tier?.project || null,
        projectTitle: tier?.expand?.project?.title ?? null,
        _isBudgetEvent: true, tier
    };
}

function deduplicateBudgetFeed(feed, walletIds, $t) {
    const gmWalletIdSet = new Set(walletIds);
    const linkedSeen = new Set();
    const deduped = [];
    for (const item of feed) {
        if (item.isTransfer && item.linkedTransactionId) {
            const linkedItem = feed.find(f => f.id === item.linkedTransactionId);
            if (linkedItem && gmWalletIdSet.has(item.walletId) && gmWalletIdSet.has(linkedItem.walletId)) {
                if (linkedSeen.has(item.id)) continue;
                linkedSeen.add(item.linkedTransactionId);
                const representative = item.amount >= 0 ? item : linkedItem;
                const otherSide = item.amount >= 0 ? linkedItem : item;
                representative.isInternalTransfer = true;
                representative.description = $t('common.transfer_label', { from: otherSide.walletName || '—', to: representative.walletName || '—' });
                representative.stepDescription = representative.description;
                deduped.push(representative);
                continue;
            }
        }
        deduped.push(item);
    }
    deduped.sort((a, b) => new Date(b.created) - new Date(a.created));
    return deduped;
}

export async function fetchBudgetFeed() {
    const walletIds = (this.fmGmWallets || []).map(w => w.id);
    if (walletIds.length === 0) { this.budgetFeed = []; return; }
    try {
        const filter = walletIds.map(id => `wallet = "${id}"`).join(' || ');
        const walletNames = {};
        (this.fmGmWallets || []).forEach(w => { walletNames[w.id] = w.name; });

        const perPage = 50;
        const [fmResult, eventsList] = await Promise.all([
            pb.collection('fm_transactions').getList(1, perPage, {
                filter, sort: '-date',
                expand: 'wallet,category,gm_tier,gm_tier.project,gm_tier.project.category,linked_transaction'
            }),
            pb.collection('gm_budget_events').getFullList({
                sort: '-created', expand: 'tier,tier.project'
            })
        ]);

        this._budgetFeedWalletNames = walletNames;
        this._budgetFeedWalletIds = walletIds;
        this._budgetFeedFilter = filter;
        this._budgetFeedEvents = eventsList.map(ev => mapBudgetEvent(ev, this.$t.bind(this)));
        this.budgetFeedPage = fmResult.page;
        this.budgetFeedTotalPages = fmResult.totalPages;
        this.budgetFeedTotalItems = fmResult.totalItems;

        const fmItems = fmResult.items.map(tx => mapFmTx(tx, walletNames, this.$t.bind(this)));
        const feed = [...fmItems, ...this._budgetFeedEvents];
        this.budgetFeed = deduplicateBudgetFeed(feed, walletIds, this.$t.bind(this));
    } catch (e) {
        console.error('Error fetching budget feed:', e);
        this.budgetFeed = [];
    }
}

export async function loadMoreBudgetFeed() {
    if (this.budgetFeedPage >= this.budgetFeedTotalPages || this.budgetFeedLoadingMore) return;
    this.budgetFeedLoadingMore = true;
    try {
        const nextPage = this.budgetFeedPage + 1;
        const result = await pb.collection('fm_transactions').getList(nextPage, 50, {
            filter: this._budgetFeedFilter, sort: '-date',
            expand: 'wallet,category,gm_tier,gm_tier.project,gm_tier.project.category,linked_transaction'
        });
        this.budgetFeedPage = result.page;
        this.budgetFeedTotalPages = result.totalPages;
        const newFmItems = result.items.map(tx => mapFmTx(tx, this._budgetFeedWalletNames, this.$t.bind(this)));
        const existingFmItems = this.budgetFeed.filter(i => !i._isBudgetEvent);
        const allFm = [...existingFmItems, ...newFmItems];
        const feed = [...allFm, ...this._budgetFeedEvents];
        this.budgetFeed = deduplicateBudgetFeed(feed, this._budgetFeedWalletIds, this.$t.bind(this));
    } catch (e) {
        console.error('Error loading more budget feed:', e);
    }
    this.budgetFeedLoadingMore = false;
}

export async function fetchCategories() {
    try {
        // NEW SCHEMA: Categories are stored in their own collection
        const records = await pb.collection('categories').getFullList({ 
            sort: 'order,name'
        });
        console.log('Fetched categories:', records.length);
        
        // Store full category objects (with id, name, color, order)
        this.categoryRecords = records;
        
        // Also store as simple array of names for backwards compatibility
        this.categories = records.map(c => c.name);
        
        // Ensure "Scholarship" category exists for filtering (virtual category for scholarship projects)
        if (!this.categories.includes('Scholarship')) {
            this.categories.push('Scholarship');
        }
        
        console.log('✅ Categories loaded:', this.categories);
    } catch (e) {
        console.error('Error fetching categories:', e);
        this.categories = ['Scholarship']; // At minimum, include Scholarship
        this.categoryRecords = [];
    }
}

// These legacy functions are kept for backwards compatibility but simplified
export function verifyProjectsHaveCategories() {
    console.log('Projects have categories via relation now');
}

export function extractCategoriesFromProjects() {
    console.log('Categories are fetched from categories collection now');
}

export async function fetchSettings() {
    const defaultTheme = { headerBg: '#6b21a8', headerHover: '#581c87', settingsIcon: '#d8b4fe', primaryBtn: '#6b21a8', colorMonetary: '#16a34a', colorInkind: '#2563eb', colorCommunity: '#ea580c', colorAllocation: '#7c3aed', colorProjectValue: '#D69828', colorBarCompleted: '#D69828', colorBarInProgress: '#F5DFA8', colorTierCompleted: '#D69828', colorTierInProgress: '#F5DFA8' };
    const defaultSettings = {
        agingFactor: 0.05,
        agingCaps: { low: 5.0, mid: 3.0, high: 2.0 },
        theme: defaultTheme,
        scholarshipRate: 360,
        // Risk learning model defaults
        learnedRiskBase: 1.0,
        completedStepsCount: 0,
        // Project counter for step_code (next project gets project_number = totalProjects + 1)
        totalProjects: 0
    };
    
    try {
        const records = await pb.collection('settings').getFullList({ limit: 1 });
        
        if (records.length > 0) {
            const s = records[0];
            this.settingsId = s.id;
            
            // Parse theme
            let themeObj = defaultTheme;
            if (s.theme) {
                if (typeof s.theme === 'string') {
                    try { themeObj = JSON.parse(s.theme); } catch (e) { /* use default */ }
                } else if (typeof s.theme === 'object') {
                    themeObj = s.theme;
                }
            }
            
            this.settings = {
                agingFactor: s.agingFactor || 0.05,
                agingCaps: typeof s.agingCaps === 'string' ? JSON.parse(s.agingCaps) : (s.agingCaps || { low: 5.0, mid: 3.0, high: 2.0 }),
                theme: themeObj,
                scholarshipRate: s.scholarshipRate || 0,
                // Risk learning model
                learnedRiskBase: s.learnedRiskBase || 1.0,
                completedStepsCount: s.completedStepsCount || 0,
                // Project counter for step_code
                totalProjects: s.totalProjects ?? 0
            };
            
            // Save theme to localStorage
            try {
                localStorage.setItem('ngo_app_theme', JSON.stringify(themeObj));
            } catch (e) { /* ignore */ }
            
            applyThemeCSSVars(themeObj);
            console.log('Settings loaded:', this.settings);
        } else {
            console.log('No settings found, using defaults');
            this.settings = defaultSettings;
            applyThemeCSSVars(defaultSettings.theme);
        }
    } catch (e) {
        console.error('Error fetching settings:', e);
        // Try localStorage for theme
        try {
            const savedTheme = localStorage.getItem('ngo_app_theme');
            if (savedTheme) {
                defaultSettings.theme = JSON.parse(savedTheme);
            }
        } catch (e) { /* ignore */ }
        this.settings = defaultSettings;
        applyThemeCSSVars(defaultSettings.theme);
    }
}

export async function saveSettings() {
    if (!this.isAuthenticated || !this.hasPerm('gm.editSettings')) {
        this.showNotification("You don't have permission to save settings.", "error");
        throw new Error("Not authorized");
    }
    
    try {
        const settingsData = {
            agingFactor: this.settings.agingFactor || 0.05,
            agingCaps: JSON.stringify(this.settings.agingCaps || { low: 5.0, mid: 3.0, high: 2.0 }),
            theme: JSON.stringify(this.settings.theme),
            scholarshipRate: this.settings.scholarshipRate || 0,
            // Risk learning model
            learnedRiskBase: this.settings.learnedRiskBase || 1.0,
            completedStepsCount: this.settings.completedStepsCount || 0
        };
        
        if (this.settingsId) {
            await pb.collection('settings').update(this.settingsId, settingsData);
        } else {
            const result = await pb.collection('settings').create(settingsData);
            this.settingsId = result.id;
        }
        
        // Save theme to localStorage
        try {
            localStorage.setItem('ngo_app_theme', JSON.stringify(this.settings.theme));
        } catch (e) { /* ignore */ }
        
        console.log('Settings saved');
        return true;
    } catch (e) {
        console.error('Error saving settings:', e);
        this.showNotification("Error saving settings: " + (e.message || 'Unknown error'), "error");
        throw e;
    }
}

export function resetThemeToDefault() {
    const defaultTheme = {
        headerBg: '#6b21a8',
        headerHover: '#581c87',
        settingsIcon: '#d8b4fe',
        primaryBtn: '#6b21a8',
        colorMonetary: '#16a34a',
        colorInkind: '#2563eb',
        colorCommunity: '#ea580c',
        colorAllocation: '#7c3aed',
        colorProjectValue: '#D69828',
        colorBarCompleted: '#D69828',
        colorBarInProgress: '#F5DFA8',
        colorTierCompleted: '#D69828',
        colorTierInProgress: '#F5DFA8'
    };
    this.settings.theme = { ...defaultTheme };
    applyThemeCSSVars(this.settings.theme);
    this.showNotification("Theme reset to default. Click 'Save Theme' to persist.", "info");
}

export function applyThemeCSSVars(theme) {
    document.documentElement.style.setProperty('--color-monetary', theme.colorMonetary || '#16a34a');
    document.documentElement.style.setProperty('--color-inkind', theme.colorInkind || '#2563eb');
    document.documentElement.style.setProperty('--color-community', theme.colorCommunity || '#ea580c');
    document.documentElement.style.setProperty('--color-allocation', theme.colorAllocation || '#7c3aed');
    document.documentElement.style.setProperty('--color-project-value', theme.colorProjectValue || '#D69828');
    document.documentElement.style.setProperty('--color-bar-completed', theme.colorBarCompleted || '#D69828');
    document.documentElement.style.setProperty('--color-bar-in-progress', theme.colorBarInProgress || '#F5DFA8');
    document.documentElement.style.setProperty('--color-tier-completed', theme.colorTierCompleted || '#D69828');
    document.documentElement.style.setProperty('--color-tier-in-progress', theme.colorTierInProgress || '#F5DFA8');
}

export async function saveThemeSettings() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to save settings.", "error");
        return;
    }
    
    try {
        this.showLoading("Saving Theme...");
        
        // Save to localStorage immediately to prevent flash on refresh
        try {
            localStorage.setItem('ngo_app_theme', JSON.stringify(this.settings.theme));
        } catch (e) {
            console.warn('Could not save theme to localStorage:', e);
        }
        
        await this.saveSettings();
        
        this.hideLoading();
        this.showNotification("Theme saved successfully!", "success");
    } catch (error) {
        this.hideLoading();
        console.error('Error saving theme:', error);
        this.showNotification("Error saving theme: " + (error.message || 'Unknown error'), "error");
    }
}

export async function saveAlgorithmSettings() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to save settings.", "error");
        return;
    }
    
    try {
        this.showLoading("Saving Algorithm Thresholds...");
        await this.saveSettings();
        this.hideLoading();
        this.showNotification("Algorithm thresholds saved successfully!", "success");
    } catch (error) {
        this.hideLoading();
        // Error already handled in saveSettings
    }
}

export async function saveGeneralSettings() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to save settings.", "error");
        return;
    }
    
    try {
        this.showLoading("Saving Scholarship Rate...");
        await this.saveSettings();
        this.hideLoading();
        this.showNotification("Scholarship rate saved successfully!", "success");
    } catch (error) {
        this.hideLoading();
        // Error already handled in saveSettings
    }
}

export async function resetRiskModel() {
    if (!this.isAuthenticated || !this.hasPerm('gm.editSettings')) {
        this.showNotification("You don't have permission to reset the risk model.", "error");
        return;
    }
    try {
        this.showLoading("Resetting risk model...");
        this.settings.learnedRiskBase = 1.0;
        this.settings.completedStepsCount = 0;
        if (this.settingsId) {
            await pb.collection('settings').update(this.settingsId, { learnedRiskBase: 1.0, completedStepsCount: 0 });
        }
        this.hideLoading();
        this.showNotification("Risk model reset to default (1.0, 0 completions).", "success");
    } catch (error) {
        this.hideLoading();
        console.error('Error resetting risk model:', error);
        this.showNotification("Error resetting risk model: " + (error.message || 'Unknown error'), "error");
    }
}
