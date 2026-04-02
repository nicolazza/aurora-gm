/**
 * Grant Allocation Methods
 * ~255 lines
 */
import { pb } from '../config.js'

export function openNewOp() {
    this.currentView = 'new_operation';
    this.sessionBudget = 0;
    this.simBudget = 0;
    this.proposals = [];
    this.walletDraws = {};
}

export function runAlgorithm(budget) {
    let allTiers = [];
    let virtualProjectState = {};
    
    // Initialize virtual state for tracking which tiers get selected
    // Use same filter as getBacklogTiers() for consistency
    this.projects.filter(p => p.type !== 'scholarship').forEach(p => {
        if (!p.tiers) return;
        virtualProjectState[p.id] = {};
        p.tiers.forEach(t => {
            // Track allocation status per tier level (0 = not selected)
            virtualProjectState[p.id][t.level] = 0;
        });
    });

    this.projects.filter(p => p.type !== 'scholarship').forEach(p => {
        if (!p.tiers) return;
        
        // Only consider the first eligible (incomplete) step per project
        const eligibleStep = this.getEligibleStep(p);
        if (!eligibleStep) return;
        
        const t = eligibleStep;
        
        // Skip if already in_progress (same as getBacklogTiers)
        if (t.status === 'in_progress') return;
        
        // Calculate base cost for this tier
        const baseCost = this.computeBaseCost(t);
        
        // Get score breakdown for display
        const breakdown = this.getScoreBreakdown(t);
        const score = this.computeStepScore(t);
        
        // Days waiting (for display purposes)
        const daysWaiting = Math.floor((new Date() - new Date(p.created)) / (1000 * 60 * 60 * 24));
        
        // Calculate labor costs for display
        const inkindPeople = t.inkindPeople || 0;
        const inkindHours = t.inkindHours || 0;
        const inkindRate = t.inkindRate || 0;
        const inkindTotal = inkindPeople * inkindHours * inkindRate;
        
        const communityPeople = t.communityPeople || 0;
        const communityHours = t.communityHours || 0;
        const communityRate = t.communityRate || 0;
        const communityTotal = communityPeople * communityHours * communityRate;
        
        // Calculate monetary costs
        let monetaryCosts = 0;
        const costs = t.monetaryCosts;
        if (costs) {
            const costsObj = typeof costs === 'string' ? JSON.parse(costs) : costs;
            monetaryCosts = Object.values(costsObj || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        }
        
        allTiers.push({
            projId: p.id,
            projName: p.title,
            level: t.level,
            tierId: t.id,
            tier: t,
            // Project info for display
            project: p,
            projectDescription: p.description || '',
            projectCategory: p.categoryName || '',
            // Cost breakdown (baseCost = total, monetaryCosts = wallet impact)
            baseCost: baseCost,
            monetaryCosts: monetaryCosts,
            inkindTotal: inkindTotal,
            inkindPeople: inkindPeople,
            inkindHours: inkindHours,
            inkindRate: inkindRate,
            communityTotal: communityTotal,
            communityPeople: communityPeople,
            communityHours: communityHours,
            communityRate: communityRate,
            // Tier info
            intervention: t.intervention,
            // Score
            score: score,
            breakdown: breakdown,
            // Allocation (set by allocateToPool, uses monetaryCosts only)
            allocated: 0
        });
    });

    // Sort by score (highest first) and allocate
    allTiers.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    
    // Allocate budget to highest-scoring tiers
    this.allocateToPool(allTiers, budget, virtualProjectState);
    
    this.proposals = allTiers.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

export function allocateToPool(pool, poolBudget, vState) {
    pool.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    let remaining = poolBudget;
    
    for (const prop of pool) {
        // Parent tier check is NOT needed here because:
        // getEligibleStep() already returns only the FIRST INCOMPLETE step per project
        // So if we have Step 2, it means Step 1 is already completed
        
        // Use MONETARY cost only (not in-kind or community) for budget calculation
        const monetaryNeeded = prop.monetaryCosts || 0;
        if (monetaryNeeded <= 0) {
            // No monetary cost = free to select (in-kind/community only)
            prop.allocated = prop.monetaryCosts;
            continue;
        }
        
        // Check if budget can cover this tier's monetary cost
        if (remaining >= monetaryNeeded) {
            prop.allocated = monetaryNeeded;
            remaining -= monetaryNeeded;
            vState[prop.projId][prop.level] = monetaryNeeded;
        } else {
            // STOP here - don't continue looking for cheaper tiers
            // This prevents selecting low-score tiers just to fill the budget
            break;
        }
    }
    return poolBudget - remaining;
}

export async function confirmOperation() {
    if (!this.hasPerm('gm.confirmSelections')) {
        this.showNotification("You don't have permission to process grant operations.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to confirm grant operations.", "error");
        return;
    }

    // Get tiers that were allocated funds by the algorithm
    const selectedTiers = this.proposals.filter(p => p.allocated > 0);

    if (selectedTiers.length === 0) {
        this.showNotification("No tiers selected. Enter a budget amount first.", "error");
        return;
    }

    try {
        this.showLoading("Marking tiers as selected...");
        
        // Mark each tier as algorithmSelected = true
        for (const tier of selectedTiers) {
            await pb.collection('tiers').update(tier.tierId, {
                algorithmSelected: true
            });
        }

        await this.fetchProjects();

        const userName = this.getCurrentUserName();
        this.logAction(`${userName} confirmed algorithmic selection for ${selectedTiers.length} tier(s)`);

        // Reset state and navigate to Project Queue
        this.sessionBudget = 0;
        this.proposals = [];
        this.grantViewMode = 'manual';
        
        this.hideLoading();
        this.showNotification(`${selectedTiers.length} tier(s) selected! Go to Project Queue to start them.`, "success");
    } catch (error) {
        console.error("Error confirming selection:", error);
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

// Open the unselect tier confirmation modal
export function openUnselectTierModal(item) {
    this.unselectTierData = {
        tierId: item.tier.id,
        projName: item.projTitle,
        level: item.level,
        intervention: item.intervention,
        selectionType: item.tier.algorithmSelectionType || 'algorithm',
        monetaryTotal: item.monetaryTotal || 0,
        score: item.score || 0
    };
    this.showUnselectTierModal = true;
}

// Close the unselect tier modal
export function closeUnselectTierModal() {
    this.showUnselectTierModal = false;
    this.unselectTierData = null;
}

// Un-select a tier that was marked by the algorithm (called from modal)
export async function confirmUnselectTier() {
    if (!this.unselectTierData) return;
    
    const tierId = this.unselectTierData.tierId;
    this.showUnselectTierModal = false;
    
    try {
        await pb.collection('tiers').update(tierId, { 
            algorithmSelected: false,
            algorithmSelectionType: null
        });
        await this.fetchProjects();
        const userName = this.getCurrentUserName();
        const projName = this.unselectTierData.projName || 'project';
        this.logAction(`${userName} unselected tier from project '${projName}'`);
        this.unselectTierData = null;
        this.showNotification("Tier unselected", "success");
    } catch (error) {
        console.error("Error unselecting tier:", error);
        this.showNotification("Error: " + error.message, "error");
    }
}

// Legacy function for direct unselect (kept for compatibility)
export async function unselectTier(tierId) {
    try {
        await pb.collection('tiers').update(tierId, { 
            algorithmSelected: false,
            algorithmSelectionType: null
        });
        await this.fetchProjects();
        const userName = this.getCurrentUserName();
        this.logAction(`${userName} unselected a tier`);
        this.showNotification("Tier unselected", "success");
    } catch (error) {
        console.error("Error unselecting tier:", error);
        this.showNotification("Error: " + error.message, "error");
    }
}

// ========== COMPASSIONATE/EMPATHIC GIVING FLOW ==========

// Start the compassion phase (called when user enters a budget)
export function startCompassionPhase() {
    this.grantPhase = 'compassion';
    this.compassionTotal = 0;
    this.empathyBudget = 0;
    this.empathySelections = [];
}

// Accept the nudge - add more budget to include the next highest-scoring tier
export function acceptNudge() {
    if (!this.canNudge) return;
    this.sessionBudget += this.nudgeAmount;
    // The watcher will automatically trigger runAlgorithm
}

// Finish compassion phase and transition to empathy phase
export function finishCompassion() {
    // Lock the compassion total (what was spent on high-score tiers)
    this.compassionTotal = this.totalAllocated;
    
    // Calculate empathy budget based on the ratio
    // compassionTotal is X% of total budget, so total = compassionTotal / (X/100)
    // empathyBudget = total - compassionTotal = compassionTotal * ((100-X)/X)
    const empathyRatio = 100 - this.compassionRatio;
    this.empathyBudget = this.compassionTotal * (empathyRatio / this.compassionRatio);
    
    // Clear empathy selections
    this.empathySelections = [];
    
    // Transition to empathy phase
    this.grantPhase = 'empathy';
}

// Toggle a tier in empathy selections
export function toggleEmpathyTier(tier) {
    const index = this.empathySelections.findIndex(t => t.tierId === tier.tierId);
    
    if (index >= 0) {
        // Already selected - remove it
        this.empathySelections.splice(index, 1);
    } else {
        // Check if adding would exceed empathy budget
        const newTotal = this.selectedEmpathyTotal + (tier.monetaryCosts || 0);
        if (newTotal > this.empathyBudget) {
            this.showNotification("This tier would exceed your empathy budget", "error");
            return;
        }
        // Add to selections
        this.empathySelections.push(tier);
    }
}

// Check if a tier is selected in empathy selections
export function isEmpathySelected(tierId) {
    return this.empathySelections.some(t => t.tierId === tierId);
}

// Open confirmation modal before finalizing selections
export function openConfirmSelectionsModal() {
    this.showConfirmSelectionsModal = true;
}

// Close confirmation modal
export function closeConfirmSelectionsModal() {
    this.showConfirmSelectionsModal = false;
}

// Confirm all selections (both compassion and empathy)
export async function confirmAllSelections() {
    this.showConfirmSelectionsModal = false;
    if (!this.hasPerm('gm.confirmSelections')) {
        this.showNotification("You don't have permission to process grant operations.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to confirm grant operations.", "error");
        return;
    }

    // Get compassion tiers (funded by algorithm)
    const compassionTiers = this.fundedProposals || [];
    // Get empathy tiers (manually selected)
    const empathyTiers = this.empathySelections || [];
    
    const totalTiers = compassionTiers.length + empathyTiers.length;

    if (totalTiers === 0) {
        this.showNotification("No tiers selected.", "error");
        return;
    }

    try {
        this.showLoading("Marking tiers as selected...");
        
        // Mark compassion tiers
        for (const tier of compassionTiers) {
            await pb.collection('tiers').update(tier.tierId, {
                algorithmSelected: true,
                algorithmSelectionType: 'compassion'
            });
        }
        
        // Mark empathy tiers
        for (const tier of empathyTiers) {
            await pb.collection('tiers').update(tier.tierId, {
                algorithmSelected: true,
                algorithmSelectionType: 'empathy'
            });
        }

        await this.fetchProjects();

        // Reset all state
        this.sessionBudget = 0;
        this.proposals = [];
        this.grantPhase = null;
        this.compassionTotal = 0;
        this.empathyBudget = 0;
        this.empathySelections = [];
        this.grantViewMode = 'manual';
        
        this.hideLoading();
        this.showNotification(`${totalTiers} tier(s) selected (${compassionTiers.length} compassion, ${empathyTiers.length} empathy)! Go to Project Queue to start them.`, "success");
    } catch (error) {
        console.error("Error confirming selection:", error);
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

export function getLiveProjectInfo(item) {
    const p = this.projects.find(x => x.id === item.projId);
    if (!p) return { name: 'Unknown', problem: '?', intervention: '?' };
    const t = p.tiers.find(x => x.level === item.level);
    return {
        name: p.title,
        problem: t ? t.problem : '?',
        intervention: t ? t.intervention : '?'
    };
}

export function openGrantDetails(tx) {
    // Ensure details is always an array (handle both array and single object cases)
    let details = tx.details || [];
    if (!Array.isArray(details)) {
        // If details is a single object, wrap it in an array for backward compatibility
        details = [details];
    }
    this.activeGrantDetails = details;
    this.activeGrantSources = tx.sources || [];
    this.activeGrantDate = new Date(tx.date).toLocaleDateString();
    this.activeGrantTotal = tx.amount;
    this.showGrantModal = true;
}

// NEW: Open Start Project modal
export function openStartProjectModal(item) {
    this.startProjectData = {
        project: item.project,
        tier: item.tier,
        projId: item.projId,
        projTitle: item.projTitle,
        level: item.level,
        intervention: item.intervention || '',
        utility: item.utility,
        monetaryCosts: { ...item.tier.monetaryCosts },
        inkindPeople: item.tier.inkindPeople || 0,
        inkindHours: item.tier.inkindHours || 0,
        inkindRate: item.tier.inkindRate || 0,
        communityPeople: item.tier.communityPeople || 0,
        communityHours: item.tier.communityHours || 0,
        communityRate: item.tier.communityRate || 0,
        donations: [...(item.tier.donations || [])],
        _stepStartPhotoCount: 0
    };
    this.showStartProjectModal = true;
    // Fetch step photo count so badge shows without opening gallery
    this.getStepPhotoCount(item.tier.id, 'step_start', item.projId).then(count => {
        if (this.startProjectData && this.startProjectData.tier && this.startProjectData.tier.id === item.tier.id) {
            this.startProjectData._stepStartPhotoCount = count;
        }
    });
}

// NEW: Open Complete Project modal (with proof pre-check)
export async function openCompleteProjectModal(item) {
    // Initialize verified labor as total person-hours (people hidden, always 1)
    const plannedInkindTotalHours = (item.tier.inkindPeople || 0) * (item.tier.inkindHours || 0);
    const plannedCommunityTotalHours = (item.tier.communityPeople || 0) * (item.tier.communityHours || 0);

    // Pre-check: count proof attachments in PM for this tier
    let proofCount = 0;
    try {
        const proofRecords = await pb.collection('pm_card_attachments').getList(1, 1, {
            filter: `tier = "${item.tier.id}" && is_proof = true`,
            requestKey: null,
        });
        proofCount = proofRecords.totalItems;
    } catch (e) {
        console.warn('[openCompleteProjectModal] Proof pre-check failed:', e?.message || e);
    }

    this.completeProjectData = {
        project: item.project,
        tier: item.tier,
        projId: item.project.id,
        projTitle: item.project.title,
        level: item.tier.level,
        verifiedMonetaryCosts: {},
        verifiedInkindPeople: 0,
        verifiedInkindHours: 0,
        verifiedInkindRate: item.tier.inkindRate || 0,
        verifiedCommunityPeople: 0,
        verifiedCommunityHours: 0,
        verifiedCommunityRate: item.tier.communityRate || 0,
        _stepCompletePhotoCount: 0,
        _inkindLogCount: 0,
        _communityLogCount: 0,
        _fmFetched: false,
        _pmProofFetched: false,
        _pmProofItems: [],
        _donationsFetched: false,
        _donations: [],
        _proofCount: proofCount,
    };
    this.showCompleteProjectModal = true;
}


export async function notifyTeamProofNeeded() {
    const data = this.completeProjectData;
    if (!data || data._notifySending) return;
    data._notifySending = true;
    try {
        const tierId = data.tier.id;
        const threads = await pb.collection('pm_threads').getFullList({
            filter: `gm_tier = "${tierId}" && title = "General"`,
            requestKey: null,
        });
        let thread = threads[0];
        if (!thread) {
            thread = await pb.collection('pm_threads').create(
                { gm_tier: tierId, user: pb.authStore.model?.id, title: 'General', lastReplyAt: new Date().toISOString() },
                { requestKey: null },
            );
        }
        const userId = pb.authStore.model?.id;
        const msg = `<p>⚠️ <strong>Proof documents are needed to complete this step!</strong></p><p>Please upload and mark attachments as "Proof" in the step card's Attachments tab.</p>`;
        await pb.collection('pm_card_comments').create({
            thread: thread.id,
            user: userId,
            content: msg,
            gm_tier: tierId,
        }, { requestKey: null });
        await pb.collection('pm_threads').update(thread.id, { lastReplyAt: new Date().toISOString() }, { requestKey: null });

        // Fire PM notification so card members see it in their inbox
        try {
            const [boards, metadata] = await Promise.all([
                pb.collection('pm_boards').getFullList({ filter: 'is_grants = true', fields: 'id', requestKey: null }),
                pb.collection('pm_gm_metadata').getFullList({ filter: `gm_tier = "${tierId}"`, fields: 'members', requestKey: null }),
            ]);
            const boardId = boards[0]?.id;
            const members = metadata[0]?.members || [];
            if (boardId && members.length > 0) {
                await pb.collection('pm_notifications').create({
                    actor: userId,
                    board: boardId,
                    type: 'proof_request',
                    summary: 'requested documental proof to complete this step!',
                    gm_tier: tierId,
                    recipients: members,
                }, { requestKey: null });
            }
        } catch (_) { /* non-critical */ }

        data._notifySent = true;
    } catch (e) {
        console.error('[notifyTeamProofNeeded] Failed:', e);
        data._notifyError = true;
    } finally {
        data._notifySending = false;
    }
}

/** Fetch FM transactions linked to this tier only (gm_tier = tierId, type = expense). Used to import verified costs. */
export async function fetchFmTransactionsForTier(tierId) {
    const list = await pb.collection('fm_transactions').getFullList({
        filter: `gm_tier = "${tierId}" && type = "expense"`,
        expand: 'category,category.cost_type',
    });
    return list;
}

/** Fetch fm_wallet_categories linked to GM cost types (is_gm_cost_type = true). Used to show Budget table icons even when tier has 0 transactions. */
async function fetchFmWalletCategoriesByCostType(getCostTypeName) {
    const list = await pb.collection('fm_wallet_categories').getFullList({
        filter: 'is_gm_cost_type = true',
        expand: 'cost_type',
    });
    const map = {};
    for (const cat of list) {
        const costType = cat.expand?.cost_type || cat.expand?.['cost_type'];
        const costTypeId = costType?.id;
        if (costTypeId && !map[costTypeId]) {
            const displayName = cat.name || '—';
            map[costTypeId] = { icon: cat.icon || 'fa-circle', color: cat.color || '#64748b', name: getCostTypeName ? (getCostTypeName(displayName) || '—') : displayName };
        }
    }
    return map;
}

/** Fetch all FM transactions (income + expense) for a tier, for the tier transactions modal. No background load. Newest first; same date ordered by created (time). */
export async function fetchFmTransactionsForTierList(tierId) {
    const list = await pb.collection('fm_transactions').getFullList({
        filter: `gm_tier = "${tierId}"`,
        expand: 'category,category.cost_type,created_by',
        sort: '-date,-created',
    });
    return list;
}

function buildTierTransactionsSummaryTable(tier, list, costTypes, getCostTypeName) {
    const monetaryCosts = typeof tier.monetaryCosts === 'string' ? (() => { try { return JSON.parse(tier.monetaryCosts); } catch (_) { return {}; } })() : (tier.monetaryCosts || {});
    const byCostType = {};
    for (const tx of list) {
        if (tx.type !== 'expense') continue;
        const costType = tx.expand?.category?.expand?.cost_type || tx.expand?.['category.cost_type'];
        const costTypeId = costType?.id;
        if (!costTypeId) continue;
        const amount = Math.abs(Number(tx.amount)) || 0;
        byCostType[costTypeId] = (byCostType[costTypeId] || 0) + amount;
    }
    const table = [];
    for (const ct of costTypes) {
        const budget = Number(monetaryCosts[ct.id]) || 0;
        const verified = byCostType[ct.id] ?? 0;
        const displayName = ct.name || '—';
        table.push({
            costTypeId: ct.id,
            costTypeName: getCostTypeName ? (getCostTypeName(displayName) || '—') : displayName,
            budget,
            verified,
            difference: verified - budget
        });
    }
    return table;
}

/** @deprecated Replaced by openStepManagementModal(). No buttons currently call this. Safe to remove once new modal is verified. */
export async function openTierTransactionsModal(tier, projectName) {
    if (!tier?.id) return;
    this.tierTransactionsModalTier = tier;
    this.tierTransactionsModalProjectName = projectName || '';
    this.showTierTransactionsModal = true;
    this.tierTransactionsModalLoading = true;
    this.tierTransactionsModalList = [];
    this.tierTransactionsModalSummaryTable = [];
    this.tierTransactionsModalCostTypeToCategory = {};
    this.tierTransactionsModalError = null;
    try {
        const [list, costTypeToCategory] = await Promise.all([
            this.fetchFmTransactionsForTierList(tier.id),
            fetchFmWalletCategoriesByCostType((name) => this.getCostTypeName(name)),
        ]);
        this.tierTransactionsModalList = list;
        this.tierTransactionsModalCostTypeToCategory = costTypeToCategory;
        const costTypes = this.costTypesForNewData || this.costTypes || [];
        this.tierTransactionsModalSummaryTable = buildTierTransactionsSummaryTable(tier, list, costTypes, (name) => this.getCostTypeName(name));
        // Budget section: open by default when no transactions, collapsed when there are transactions
        this.tierTransactionsModalBudgetCollapsed = !!(list && list.length > 0);
    } catch (e) {
        console.error('openTierTransactionsModal', e);
        this.tierTransactionsModalError = e?.message || 'Could not load transactions.';
    } finally {
        this.tierTransactionsModalLoading = false;
    }
}

/** @deprecated See openTierTransactionsModal. */
export function closeTierTransactionsModal() {
    this.showTierTransactionsModal = false;
    this.tierTransactionsModalTier = null;
    this.tierTransactionsModalProjectName = '';
    this.tierTransactionsModalList = [];
    this.tierTransactionsModalSummaryTable = [];
    this.tierTransactionsModalCostTypeToCategory = {};
    this.tierTransactionsModalBudgetCollapsed = true;
    this.tierTransactionsModalCategoryFilter = '';
    this.tierTransactionsModalLoading = false;
    this.tierTransactionsModalError = null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step Management & Research Modal (read-only mirror of PM step card modal)
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Open the read-only "Management & Research" modal for a tier.
 * Fetches tier record, transactions, budget rows, labor data, PM checklists,
 * settings theme colours, and computes tier total value — all fresh on every click.
 */
export async function openStepManagementModal(tier, projectName) {
    if (!tier?.id) return;
    const tierId = tier.id;

    // Reset & show
    this.stepMgmtTier = tier;
    this.stepMgmtProjectName = projectName || '';
    this.showStepManagementModal = true;
    this.stepMgmtLoading = true;
    this.stepMgmtError = null;
    this.stepMgmtActiveTab = 'overview';
    this.stepMgmtMonetary = 0;
    this.stepMgmtInkind = 0;
    this.stepMgmtCommunity = 0;
    this.stepMgmtScore = null;
    this.stepMgmtTransactions = [];
    this.stepMgmtBudgetRows = [];
    this.stepMgmtLabor = null;
    this.stepMgmtLaborLogs = [];
    this.stepMgmtTierValue = 0;
    this.stepMgmtBudgetCollapsed = true;
    this.stepMgmtAllTxExpanded = false;
    this.stepMgmtExpandedBudget = [];
    this.stepMgmtExpandedLabor = [];
    this.stepMgmtCategoryFilter = '';
    this.stepMgmtDiscussionSearch = '';
    this.stepMgmtDiscussionUserFilter = '';
    this.stepMgmtDiscussionShowFilters = false;
    this.stepMgmtChecklists = [];
    this.stepMgmtTodoTotal = 0;
    this.stepMgmtTodoDone = 0;
    this.stepMgmtTxCount = 0;
    this.stepMgmtComments = [];
    this.stepMgmtCommentCount = 0;
    this.stepMgmtPhotos = [];
    this.stepMgmtPhotoCount = 0;
    this.stepMgmtPhotoViewerIndex = null;
    this.stepMgmtAttachments = [];
    this.stepMgmtAttachmentCount = 0;
    this.stepMgmtInterventions = [];
    this.stepMgmtInterventionCount = 0;
    this.stepMgmtDonations = [];
    this.stepMgmtDonationCount = 0;
    this.stepMgmtDonationTotal = 0;
    this.stepMgmtSalesTransactions = [];
    this.stepMgmtSalesNotes = '';
    this.stepMgmtSalesTotal = 0;
    this.stepMgmtSalesCount = 0;

    try {
        // Parallel fetch: tier record, raw transactions, wallet categories, settings, labor logs, GM metadata (for todos)
        const [tierRecord, rawTxs, costTypeCategories, settingsRecords, laborLogs, gmMetaRecords] = await Promise.all([
            pb.collection('tiers').getOne(tierId, { $autoCancel: false }).catch(() => null),
            pb.collection('fm_transactions').getFullList({
                filter: `gm_tier = "${tierId}"`,
                expand: 'category,category.cost_type,created_by',
                sort: '-date,-created',
                $autoCancel: false,
            }),
            fetchFmWalletCategoriesByCostType((name) => this.getCostTypeName(name)),
            pb.collection('settings').getFullList({ $autoCancel: false }).catch(() => []),
            pb.collection('fm_labor_logs').getFullList({
                filter: `tier = "${tierId}"`,
                expand: 'created_by,donor',
                sort: '-date,-created',
                $autoCancel: false,
            }).catch(() => []),
            pb.collection('pm_gm_metadata').getFullList({
                filter: `gm_tier = "${tierId}"`,
                $autoCancel: false,
            }).catch(() => []),
        ]);

        // ── Theme colours from settings ──
        let theme = {};
        try {
            const raw = settingsRecords[0]?.theme;
            theme = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch { /* ignore */ }
        const headerBg = theme.headerBg || '#6b21a8';
        const colorInkind = theme.colorInkind || '#2563eb';
        const colorCommunity = theme.colorCommunity || '#ea580c';

        // ── Map transactions (same shape as PM) ──
        const transactions = rawTxs.map(r => {
            const cat = r.expand?.category;
            const user = r.expand?.created_by;
            const catColor = cat?.color || '#9ca3af';
            const catIcon = cat?.icon
                ? (cat.icon.startsWith('fa-') ? 'fas ' + cat.icon : 'fas fa-' + cat.icon)
                : 'fas fa-circle';
            const costType = cat?.expand?.cost_type;
            return {
                id: r.id,
                date: r.date ? r.date.split(' ')[0] : (r.created?.split(' ')[0] ?? ''),
                category: cat?.name ?? 'Uncategorized',
                categoryColor: catColor,
                categoryIcon: catIcon,
                categoryId: cat?.id || '',
                costTypeId: costType?.id || '',
                user: user?.name || user?.username || '',
                description: r.description || '',
                amount: Number(r.amount) || 0,
                type: r.type === 'income' ? 'income' : 'expense',
            };
        });
        this.stepMgmtTransactions = transactions;
        this.stepMgmtTxCount = transactions.length + (laborLogs ? laborLogs.length : 0);

        // ── Budget rows (monetary costs) ──
        // Always use original monetaryCosts for the Budget column (planned budget).
        // Verified column comes from FM transactions (verifiedByCostType below).
        if (tierRecord) {
            const isCompleted = tierRecord.status === 'completed';
            let monetaryCosts = {};
            try {
                const mc = tierRecord.monetaryCosts;
                monetaryCosts = typeof mc === 'string' ? JSON.parse(mc) : (mc || {});
            } catch { /* ignore */ }

            // Verified expenses by cost type
            const verifiedByCostType = {};
            for (const tx of rawTxs) {
                if (tx.type !== 'expense') continue;
                const costType = tx.expand?.category?.expand?.cost_type || tx.expand?.['category.cost_type'];
                const costTypeId = costType?.id;
                if (!costTypeId) continue;
                verifiedByCostType[costTypeId] = (verifiedByCostType[costTypeId] || 0) + Math.abs(Number(tx.amount) || 0);
            }

            const allCostTypeIds = new Set([...Object.keys(monetaryCosts), ...Object.keys(verifiedByCostType)]);
            const rows = [];
            for (const ctId of allCostTypeIds) {
                const budget = Number(monetaryCosts[ctId]) || 0;
                const verified = verifiedByCostType[ctId] ?? 0;
                const catInfo = costTypeCategories[ctId];
                rows.push({
                    costTypeId: ctId,
                    costTypeName: catInfo?.name || '—',
                    icon: catInfo?.icon ? (catInfo.icon.startsWith('fa-') ? 'fas ' + catInfo.icon : 'fas fa-' + catInfo.icon) : 'fas fa-circle',
                    color: catInfo?.color || '#64748b',
                    budget,
                    verified,
                    difference: verified - budget,
                });
            }
            this.stepMgmtBudgetRows = rows;

            // ── Labor data ──
            const inkindLogs = laborLogs.filter(l => l.type === 'inkind');
            const communityLogs = laborLogs.filter(l => l.type === 'community');
            const inkindLoggedHours = inkindLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0)), 0);
            const communityLoggedHours = communityLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0)), 0);

            const labor = {
                inkind: { planned: null, logged: null },
                community: { planned: null, logged: null },
                colorInkind,
                colorCommunity,
            };

            const inkindPeople = Number(isCompleted ? tierRecord.verifiedInkindPeople : tierRecord.inkindPeople) || 0;
            const inkindHours = Number(isCompleted ? tierRecord.verifiedInkindHours : tierRecord.inkindHours) || 0;
            const inkindRate = Number(isCompleted ? tierRecord.verifiedInkindRate : tierRecord.inkindRate) || 0;
            if (inkindPeople * inkindHours > 0) {
                labor.inkind.planned = { people: inkindPeople, hours: inkindHours, rate: inkindRate, totalHours: inkindPeople * inkindHours, value: inkindPeople * inkindHours * inkindRate };
            }
            const communityPeople = Number(isCompleted ? tierRecord.verifiedCommunityPeople : tierRecord.communityPeople) || 0;
            const communityHours = Number(isCompleted ? tierRecord.verifiedCommunityHours : tierRecord.communityHours) || 0;
            const communityRate = Number(isCompleted ? tierRecord.verifiedCommunityRate : tierRecord.communityRate) || 0;
            if (communityPeople * communityHours > 0) {
                labor.community.planned = { people: communityPeople, hours: communityHours, rate: communityRate, totalHours: communityPeople * communityHours, value: communityPeople * communityHours * communityRate };
            }

            // Total logged value — use per-log rate, fall back to tier's planned rate
            const inkindLoggedValue = inkindLogs.reduce((s, l) => {
                const r = Number(l.rate) || inkindRate;
                return s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * r);
            }, 0);
            const communityLoggedValue = communityLogs.reduce((s, l) => {
                const r = Number(l.rate) || communityRate;
                return s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * r);
            }, 0);
            if (inkindLogs.length > 0) {
                labor.inkind.logged = { totalHours: inkindLoggedHours, totalValue: inkindLoggedValue, logCount: inkindLogs.length };
            }
            if (communityLogs.length > 0) {
                labor.community.logged = { totalHours: communityLoggedHours, totalValue: communityLoggedValue, logCount: communityLogs.length };
            }
            this.stepMgmtLabor = labor;

            // ── Individual labor log entries (for Labor Logs table) ──
            this.stepMgmtLaborLogs = laborLogs.map(l => ({
                date: l.date ? l.date.split(' ')[0] : (l.created?.split(' ')[0] ?? ''),
                type: l.type,
                people: Number(l.people) || 0,
                hours: Number(l.hours) || 0,
                rate: Number(l.rate) || 0,
                user: l.expand?.created_by?.name || l.expand?.created_by?.username || '',
                donor: l.expand?.donor?.name || '',
            }));

            // ── Tier total value (mirrors PM's computeTierValue) ──
            if (tierRecord.cost != null && tierRecord.cost !== '' && Number(tierRecord.cost) > 0) {
                this.stepMgmtTierValue = Number(tierRecord.cost);
            } else {
                let monetary = 0;
                for (const v of Object.values(monetaryCosts)) monetary += Number(v) || 0;
                this.stepMgmtTierValue = monetary + (inkindPeople * inkindHours * inkindRate) + (communityPeople * communityHours * communityRate);
            }

            // Overview tab: planned value breakdown (from tier fields)
            let monetaryTotal = 0;
            for (const v of Object.values(monetaryCosts)) monetaryTotal += Number(v) || 0;
            this.stepMgmtMonetary = monetaryTotal;
            this.stepMgmtInkind = inkindPeople * inkindHours * inkindRate;
            this.stepMgmtCommunity = communityPeople * communityHours * communityRate;

            // Overview tab: actual value breakdown (from FM data)
            let actualMonetary = 0;
            for (const tx of rawTxs) {
                if (tx.type === 'expense') actualMonetary += Math.abs(Number(tx.amount) || 0);
            }
            this.stepMgmtActualMonetary = actualMonetary;
            this.stepMgmtActualInkind = inkindLogs.reduce((s, l) => {
                const r = Number(l.rate) || inkindRate;
                return s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * r);
            }, 0);
            this.stepMgmtActualCommunity = communityLogs.reduce((s, l) => {
                const r = Number(l.rate) || communityRate;
                return s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * r);
            }, 0);

            this.stepMgmtScore = this.computeStepScore ? this.computeStepScore(tierRecord) : null;

            // Store headerBg + theme colors on tier for template use
            this.stepMgmtTier = { ...tierRecord, _headerBg: headerBg, _colorMonetary: theme.colorMonetary || '#16a34a', _colorInkind: colorInkind, _colorCommunity: colorCommunity };
        }

        // ── GM metadata checklists (for Todos tab) ──
        const gmMeta = gmMetaRecords[0];
        if (gmMeta) {
            const checklists = Array.isArray(gmMeta.checklists) ? gmMeta.checklists : [];
            this.stepMgmtChecklists = checklists;
            let total = 0, done = 0;
            for (const cl of checklists) {
                const items = Array.isArray(cl.items) ? cl.items : [];
                total += items.length;
                done += items.filter(i => i.completed || i.checked).length;
            }
            this.stepMgmtTodoTotal = total;
            this.stepMgmtTodoDone = done;
        }

        // Overview data is ready — render immediately while remaining tabs load
        this.stepMgmtLoading = false;

        // ── Parallel fetch: discussions, interventions, photos, attachments ──
        const projectId = tier.project || tier.expand?.project?.id || '';

        const discussionsPromise = (async () => {
            const rawThreads = await pb.collection('pm_threads').getFullList({
                filter: `gm_tier = "${tierId}"`,
                expand: 'user',
                sort: '-lastReplyAt,-created',
                $autoCancel: false,
            });
            const threadIds = rawThreads.map(t => t.id);
            let allComments = [];
            if (threadIds.length > 0) {
                allComments = await pb.collection('pm_card_comments').getFullList({
                    filter: threadIds.map(id => `thread = "${id}"`).join(' || '),
                    expand: 'user',
                    sort: '-created',
                    $autoCancel: false,
                });
            }
            const commentsByThread = {};
            for (const c of allComments) {
                const tid = c.thread;
                if (!commentsByThread[tid]) commentsByThread[tid] = [];
                commentsByThread[tid].push(c);
            }
            this.stepMgmtThreads = rawThreads.map(t => {
                const user = t.expand?.user;
                const threadComments = commentsByThread[t.id] || [];
                const lastComment = threadComments[0];
                const lastUser = lastComment?.expand?.user;
                return {
                    id: t.id,
                    title: t.title || '',
                    user: t.user,
                    userName: user?.name || user?.username || user?.email || 'Unknown',
                    userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                    lastReplyAt: t.lastReplyAt || t.created,
                    created: t.created,
                    replyCount: threadComments.length,
                    lastReplyPreview: (() => { const raw = lastComment ? (lastComment.content || '').replace(/<[^>]*>/g, '').trim() : ''; return raw.length > 60 ? raw.slice(0, 60) + '...' : raw; })(),
                    lastReplyUser: lastUser?.name || lastUser?.username || '',
                };
            });
            this.stepMgmtCommentCount = rawThreads.length;
        })().catch(e => console.warn('stepMgmt: threads error', e));

        const interventionsPromise = (async () => {
            const rawInterventions = await pb.collection('pm_interventions').getFullList({
                filter: `gm_tier = "${tierId}"`,
                expand: 'created_by',
                sort: '-date,-created',
                $autoCancel: false,
            });
            this.stepMgmtInterventions = rawInterventions.map(r => {
                const user = r.expand?.created_by;
                return {
                    id: r.id,
                    date: r.date ? r.date.split(' ')[0] : '',
                    description: r.description || '',
                    userName: user?.name || user?.username || user?.email || 'Unknown',
                    userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                    created: r.created,
                };
            });
            this.stepMgmtInterventionCount = rawInterventions.length;
        })().catch(e => console.warn('stepMgmt: interventions error', e));

        const photosPromise = (async () => {
            if (!projectId) return;
            const rawPhotos = await pb.collection('photos').getFullList({
                filter: `project = "${projectId}" && tier = "${tierId}"`,
                sort: 'order,created',
                $autoCancel: false,
            });
            const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            this.stepMgmtPhotos = rawPhotos.map(r => {
                const filename = r.image || '';
                return {
                    id: r.id,
                    filename,
                    url: filename ? pb.files.getUrl(r, filename) : '',
                    thumbUrl: filename ? pb.files.getUrl(r, filename, { thumb: '200x200' }) : '',
                    collectionId: r.collectionId,
                    context: r.context || '',
                };
            }).sort((a, b) => (a.context === 'intervention' ? 1 : 0) - (b.context === 'intervention' ? 1 : 0));
            this.stepMgmtPhotoCount = this.stepMgmtPhotos.length;
        })().catch(e => console.warn('stepMgmt: photos error', e));

        const attachmentsPromise = (async () => {
            const attFilter = `tier = "${tierId}"`;
            const rawAttachments = await pb.collection('pm_card_attachments').getFullList({
                filter: attFilter,
                sort: '-created',
                $autoCancel: false,
            });
            const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            this.stepMgmtAttachments = rawAttachments.filter(r => r.file).map(r => {
                const filename = r.file || '';
                const lower = filename.toLowerCase();
                return {
                    id: r.id,
                    file: filename,
                    name: r.name || filename,
                    url: filename ? pb.files.getUrl(r, filename) : '',
                    isImage: IMAGE_EXTS.some(ext => lower.endsWith(ext)),
                    collectionId: r.collectionId,
                    created: r.created,
                };
            });
            this.stepMgmtAttachmentCount = this.stepMgmtAttachments.length;
        })().catch(e => console.warn('stepMgmt: attachments error', e));

        const donationsPromise = (async () => {
            try {
                const tierRec = await pb.collection('tiers').getOne(tierId, { fields: 'donations', $autoCancel: false });
                const dons = Array.isArray(tierRec.donations) ? tierRec.donations : [];
                this.stepMgmtDonations = dons;
                this.stepMgmtDonationCount = dons.length;
                this.stepMgmtDonationTotal = dons.reduce((s, d) => s + (Number(d.value) || 0), 0);
            } catch { /* no donations */ }
        })();

        const salesPromise = (async () => {
            try {
                const salesTxs = await pb.collection('fm_transactions').getFullList({
                    filter: `gm_tier = "${tierId}" && type = "income"`,
                    expand: 'category,created_by',
                    sort: '-date,-created',
                    $autoCancel: false,
                });
                const mapped = salesTxs.map(r => {
                    const cat = r.expand?.category;
                    const user = r.expand?.created_by;
                    return {
                        id: r.id,
                        date: r.date ? r.date.split(' ')[0] : (r.created?.split(' ')[0] ?? ''),
                        category: cat?.name ?? '',
                        categoryColor: cat?.color || '#9ca3af',
                        categoryIcon: cat?.icon ? (cat.icon.startsWith('fa-') ? 'fas ' + cat.icon : 'fas fa-' + cat.icon) : 'fas fa-circle',
                        user: user?.name || user?.username || '',
                        description: r.description || '',
                        amount: Math.abs(Number(r.amount) || 0),
                    };
                });
                this.stepMgmtSalesTransactions = mapped;
                this.stepMgmtSalesCount = mapped.length;
                this.stepMgmtSalesTotal = mapped.reduce((s, t) => s + t.amount, 0);
                try {
                    const tierRec = await pb.collection('tiers').getOne(tierId, { fields: 'sales_notes', $autoCancel: false });
                    this.stepMgmtSalesNotes = tierRec.sales_notes || '';
                } catch { /* ignore */ }
            } catch { /* no sales */ }
        })();

        await Promise.all([discussionsPromise, interventionsPromise, photosPromise, attachmentsPromise, donationsPromise, salesPromise]);
    } catch (e) {
        console.error('openStepManagementModal', e);
        this.stepMgmtError = e?.message || 'Could not load step data.';
    } finally {
        this.stepMgmtLoading = false;
    }
}

export function closeStepManagementModal() {
    this.showStepManagementModal = false;
    this.stepMgmtTier = null;
    this.stepMgmtProjectName = '';
    this.stepMgmtLoading = false;
    this.stepMgmtError = null;
    this.stepMgmtActiveTab = 'overview';
    this.stepMgmtMonetary = 0;
    this.stepMgmtInkind = 0;
    this.stepMgmtCommunity = 0;
    this.stepMgmtScore = null;
    this.stepMgmtTransactions = [];
    this.stepMgmtBudgetRows = [];
    this.stepMgmtLabor = null;
    this.stepMgmtLaborLogs = [];
    this.stepMgmtTierValue = 0;
    this.stepMgmtBudgetCollapsed = true;
    this.stepMgmtCategoryFilter = '';
    this.stepMgmtDiscussionSearch = '';
    this.stepMgmtDiscussionUserFilter = '';
    this.stepMgmtDiscussionShowFilters = false;
    this.stepMgmtChecklists = [];
    this.stepMgmtTodoTotal = 0;
    this.stepMgmtTodoDone = 0;
    this.stepMgmtTxCount = 0;
    this.stepMgmtComments = [];
    this.stepMgmtCommentCount = 0;
    this.stepMgmtThreads = [];
    this.stepMgmtSelectedThread = null;
    this.stepMgmtThreadComments = [];
    this.stepMgmtThreadCommentsLoading = false;
    this.stepMgmtPhotos = [];
    this.stepMgmtPhotoCount = 0;
    this.stepMgmtPhotoViewerIndex = null;
    this.stepMgmtAttachments = [];
    this.stepMgmtAttachmentCount = 0;
    this.stepMgmtInterventions = [];
    this.stepMgmtInterventionCount = 0;
}

/** Select a thread and load its comments */
export async function selectStepMgmtThread(thread) {
    this.stepMgmtSelectedThread = thread;
    this.stepMgmtThreadComments = [];
    this.stepMgmtThreadCommentsLoading = true;
    this.stepMgmtDiscussionSearch = '';
    this.stepMgmtDiscussionUserFilter = '';
    this.stepMgmtDiscussionShowFilters = false;
    try {
        const [rawComments, rawAttachments] = await Promise.all([
            pb.collection('pm_card_comments').getFullList({
                filter: `thread = "${thread.id}"`,
                expand: 'user',
                sort: '-created',
                $autoCancel: false,
            }),
            pb.collection('pm_card_attachments').getFullList({
                filter: `tier = "${this.stepMgmtTier?.id}"`,
                sort: 'created',
                $autoCancel: false,
            }),
        ]);
        const attachmentsByComment = {};
        for (const att of rawAttachments) {
            if (att.comment) {
                if (!attachmentsByComment[att.comment]) attachmentsByComment[att.comment] = [];
                const filename = att.file || '';
                attachmentsByComment[att.comment].push({
                    id: att.id,
                    name: att.name || filename,
                    url: filename ? pb.files.getUrl(att, filename) : '',
                    isImage: /\.(jpe?g|png|webp|gif)$/i.test(filename),
                });
            }
        }
        this.stepMgmtThreadComments = rawComments.map(r => {
            const user = r.expand?.user;
            return {
                id: r.id,
                userName: user?.name || user?.username || user?.email || 'Unknown',
                userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                content: r.content || '',
                created: r.created,
                attachments: attachmentsByComment[r.id] || [],
            };
        });
    } catch (err) {
        console.warn('Failed to load thread comments:', err);
    } finally {
        this.stepMgmtThreadCommentsLoading = false;
    }
}

/** Go back to thread list */
export function deselectStepMgmtThread() {
    this.stepMgmtSelectedThread = null;
    this.stepMgmtThreadComments = [];
    this.stepMgmtDiscussionSearch = '';
    this.stepMgmtDiscussionUserFilter = '';
    this.stepMgmtDiscussionShowFilters = false;
}

/** Toggle expanded state for a monetary budget row */
export function toggleStepMgmtBudgetRow(id) {
    const idx = this.stepMgmtExpandedBudget.indexOf(id);
    if (idx >= 0) this.stepMgmtExpandedBudget.splice(idx, 1);
    else this.stepMgmtExpandedBudget.push(id);
}

/** Toggle expanded state for a labor row (inkind / community) */
export function toggleStepMgmtLaborRow(type) {
    const idx = this.stepMgmtExpandedLabor.indexOf(type);
    if (idx >= 0) this.stepMgmtExpandedLabor.splice(idx, 1);
    else this.stepMgmtExpandedLabor.push(type);
}

/** Get transactions belonging to a specific costTypeId */
export function getStepMgmtTxForCostType(costTypeId) {
    return (this.stepMgmtTransactions || []).filter(tx => tx.costTypeId === costTypeId);
}

/** Get transactions that don't belong to any budget row */
export function getStepMgmtOrphanTxs() {
    const budgetIds = new Set((this.stepMgmtBudgetRows || []).map(r => r.costTypeId));
    return (this.stepMgmtTransactions || []).filter(tx => !budgetIds.has(tx.costTypeId));
}

/** Get labor logs filtered by type (inkind / community) */
export function getStepMgmtLogsByType(type) {
    return (this.stepMgmtLaborLogs || []).filter(l => l.type === type);
}

/** All transactions + labor logs merged and sorted by date (for Table 3). */
export function getAllStepMgmtEntries() {
    const txEntries = (this.stepMgmtTransactions || []).map((tx, i) => ({
        id: 'm-' + i,
        date: tx.date,
        kind: 'monetary',
        user: tx.user,
        category: tx.category,
        categoryColor: tx.categoryColor,
        categoryIcon: tx.categoryIcon,
        details: tx.description ? (tx.description.length > 40 ? tx.description.slice(0, 40) + '…' : tx.description) : '',
        amount: tx.amount,
        type: tx.type,
    }));
    const laborColors = {
        inkind: this.stepMgmtLabor?.colorInkind || this.settings?.theme?.colorInkind || '#2563eb',
        community: this.stepMgmtLabor?.colorCommunity || this.settings?.theme?.colorCommunity || '#ea580c',
    };
    const laborEntries = (this.stepMgmtLaborLogs || []).map((ll, i) => ({
        id: 'l-' + i,
        date: ll.date,
        kind: 'labor',
        user: ll.user,
        donor: ll.donor || '',
        category: ll.type === 'inkind' ? 'In-Kind Labor' : 'Community Labor',
        categoryColor: ll.type === 'inkind' ? laborColors.inkind : laborColors.community,
        categoryIcon: 'fas fa-hands-helping',
        details: ll.hours + 'h @ $' + this.formatMoney(ll.rate || 0) + '/h',
        amount: ll.people * ll.hours * (ll.rate || 0),
        type: 'expense',
    }));
    return [...txEntries, ...laborEntries].sort((a, b) => b.date.localeCompare(a.date));
}

/** Unique categories from step management transactions list (for filter dropdown). */
export function getStepMgmtCategoryOptions() {
    const list = this.stepMgmtTransactions || [];
    const seen = new Set();
    const opts = [{ id: '', name: 'All Categories' }];
    list.forEach(tx => {
        if (tx.categoryId && !seen.has(tx.categoryId)) {
            seen.add(tx.categoryId);
            opts.push({ id: tx.categoryId, name: tx.category || '—' });
        }
    });
    return opts;
}

/** Filtered transactions for step management modal. */
export function getStepMgmtFilteredTransactions() {
    const list = this.stepMgmtTransactions || [];
    const filter = this.stepMgmtCategoryFilter;
    if (!filter) return list;
    return list.filter(tx => tx.categoryId === filter);
}

/** Category (icon, color, name) for this cost type in step management Budget table. */
export function getStepMgmtCategoryForCostType(costTypeId) {
    if (costTypeId == null) return null;
    // Try from transactions first
    const list = this.stepMgmtTransactions || [];
    for (const tx of list) {
        if (tx.categoryId) {
            // Not a direct cost type match — budget rows already have icon/color
            break;
        }
    }
    return null;
}

/** Category (icon, color, name) for a step management transaction. */
export function getStepMgmtTransactionCategoryDisplay(tx) {
    const color = tx?.categoryColor || '#9ca3af';
    const icon = tx?.categoryIcon || 'fas fa-circle';
    const name = tx?.category || '—';
    return {
        style: { backgroundColor: color + '25', color },
        iconClass: icon,
        name,
    };
}

/** Category (icon, color, name) for this cost type for Budget table. Uses transaction category if any, else fallback from fm_wallet_categories so icons show even with 0 transactions. */
export function getTierTransactionsModalCategoryForCostType(costTypeId) {
    if (costTypeId == null) return null;
    const list = this.tierTransactionsModalList || [];
    for (const tx of list) {
        const cat = tx.expand?.category;
        const costType = cat?.expand?.cost_type || cat?.expand?.['category.cost_type'];
        if (costType?.id === costTypeId) return cat;
    }
    return this.tierTransactionsModalCostTypeToCategory?.[costTypeId] || null;
}

/** Unique categories from tier transactions list (for filter dropdown). */
export function getTierTransactionsModalCategoryOptions() {
    const list = this.tierTransactionsModalList || [];
    const seen = new Set();
    const opts = [{ id: '', name: 'All categories' }];
    list.forEach(tx => {
        const c = tx.expand?.category;
        if (c && c.id && !seen.has(c.id)) {
            seen.add(c.id);
            opts.push({ id: c.id, name: c.name || '—' });
        }
    });
    return opts;
}

/** Formatted Available amount for Budget table: green = no sign, red = minus. */
export function formatBudgetAvailable(difference) {
    const d = Number(difference);
    const sign = d > 0 ? '-' : ''; // red (over budget) = minus; green (under) = no sign
    return sign + '\u0024' + this.formatMoney(Math.abs(d));
}

/** Formatted Available total for Budget table footer. */
export function formatBudgetAvailableTotal() {
    const table = this.tierTransactionsModalSummaryTable || [];
    const total = table.reduce((s, r) => s + r.verified, 0) - table.reduce((s, r) => s + r.budget, 0);
    const sign = total > 0 ? '-' : '';
    return sign + '\u0024' + this.formatMoney(Math.abs(total));
}

/** Safe category display for a transaction (icon, color, name). Always returns an object so icons render consistently. */
export function getTransactionCategoryDisplay(tx) {
    const cat = tx?.expand?.category || null;
    const type = tx?.type === 'income' ? 'income' : 'expense';
    const color = cat?.color || (type === 'income' ? '#16a34a' : '#dc2626');
    const bgColor = color + '25';
    const icon = (cat?.icon && String(cat.icon).trim()) ? String(cat.icon).trim() : 'fa-circle';
    const rawName = cat?.name || '—';
    const name = this.getCostTypeName(rawName) || '—';
    return { style: { backgroundColor: bgColor, color }, iconClass: 'fas ' + (icon.startsWith('fa-') ? icon : 'fa-' + icon), name };
}

/** Transactions list filtered by selected category (for second table). */
export function getTierTransactionsModalFilteredList() {
    const list = this.tierTransactionsModalList || [];
    const filter = this.tierTransactionsModalCategoryFilter;
    if (!filter) return list;
    return list.filter(tx => (tx.expand?.category?.id || tx.category) === filter);
}

/** Open FM import modal, fetch tier-linked FM transactions + labor logs, show table + summary. User can then Apply or Cancel. */
export async function openFmImportModal() {
    if (!this.completeProjectData?.tier?.id) return;
    this.showFmImportModal = true;
    this.fmImportLoading = true;
    this.fmImportError = null;
    this.fmImportTable = [];
    this.fmImportSummary = '';
    this.fmImportVerified = null;
    this.fmImportLabor = null;
    this.fmImportLaborLogs = [];
    const tier = this.completeProjectData.tier;
    const tierId = tier.id;
    const costTypes = this.costTypesForNewData || [];
    const monetaryCosts = typeof tier.monetaryCosts === 'string' ? (() => { try { return JSON.parse(tier.monetaryCosts); } catch (_) { return {}; } })() : (tier.monetaryCosts || {});
    try {
        // Fetch monetary transactions and labor logs in parallel
        const [list, laborLogs] = await Promise.all([
            this.fetchFmTransactionsForTier(tierId),
            pb.collection('fm_labor_logs').getFullList({ filter: `tier = "${tierId}"`, expand: 'created_by', $autoCancel: false }).catch(() => []),
        ]);

        // ── Monetary ──
        const byCostType = {};
        for (const tx of list) {
            const costType = tx.expand?.category?.expand?.cost_type || tx.expand?.['category.cost_type'];
            const costTypeId = costType?.id;
            if (!costTypeId) continue;
            const amount = Math.abs(Number(tx.amount)) || 0;
            byCostType[costTypeId] = (byCostType[costTypeId] || 0) + amount;
        }
        const verified = {};
        const table = [];
        for (const ct of costTypes) {
            const budget = Number(monetaryCosts[ct.id]) || 0;
            const ver = byCostType[ct.id] ?? 0;
            verified[ct.id] = ver;
            const displayName = ct.name || '—';
            table.push({
                costTypeName: this.getCostTypeName(displayName) || '—',
                budget,
                verified: ver,
                difference: ver - budget
            });
        }
        this.fmImportVerified = verified;
        this.fmImportTable = table;
        const totalBudget = tier.allocatedMonetaryCost ?? 0;
        const totalVerified = Object.values(verified).reduce((s, v) => s + (Number(v) || 0), 0);
        const diff = totalBudget - totalVerified;
        if (diff > 0) {
            this.fmImportSummary = `The total verified cost for this step is lower than the original budget. $${this.formatMoney(diff)} will be reimbursed to the wallet.`;
        } else if (diff < 0) {
            this.fmImportSummary = `The total verified cost for this step is higher than the original budget. $${this.formatMoney(-diff)} will be subtracted from the wallet.`;
        } else {
            this.fmImportSummary = 'The total verified cost for this step matches the original budget. No wallet adjustment.';
        }

        // ── Labor ──
        // Aggregate total person-hours and total value per type.
        // Total value = sum(people_i × hours_i × rate_i) — no manual rate needed.
        const inkindLogs = laborLogs.filter(l => l.type === 'inkind');
        const communityLogs = laborLogs.filter(l => l.type === 'community');
        const inkindTotalHours = inkindLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0)), 0);
        const communityTotalHours = communityLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0)), 0);
        const inkindTotalValue = inkindLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * (Number(l.rate) || 0)), 0);
        const communityTotalValue = communityLogs.reduce((s, l) => s + ((Number(l.people) || 0) * (Number(l.hours) || 0) * (Number(l.rate) || 0)), 0);
        this.fmImportLabor = {
            inkindTotalHours,
            communityTotalHours,
            inkindTotalValue,
            communityTotalValue,
            inkindCount: inkindLogs.length,
            communityCount: communityLogs.length,
        };

        // ── Individual labor log entries ──
        this.fmImportLaborLogs = laborLogs.map(l => ({
            date: l.date ? l.date.split(' ')[0] : (l.created?.split(' ')[0] ?? ''),
            type: l.type,
            people: Number(l.people) || 0,
            hours: Number(l.hours) || 0,
            rate: Number(l.rate) || 0,
            user: l.expand?.created_by?.name || l.expand?.created_by?.username || '',
        }));
    } catch (e) {
        console.error("openFmImportModal", e);
        this.fmImportError = e?.message || "Could not fetch from Finance.";
    } finally {
        this.fmImportLoading = false;
    }
}

export function closeFmImportModal() {
    this.showFmImportModal = false;
    this.fmImportLoading = false;
    this.fmImportError = null;
    this.fmImportTable = [];
    this.fmImportSummary = '';
    this.fmImportVerified = null;
    this.fmImportLabor = null;
    this.fmImportLaborLogs = [];
}

/** Apply the previewed FM import to verified costs (monetary + labor) and close the modal. */
export function applyFmImport() {
    const parts = [];
    if (this.fmImportVerified) {
        this.completeProjectData.verifiedMonetaryCosts = { ...this.fmImportVerified };
        const n = this.fmImportTable.filter(r => r.verified > 0).length;
        if (n > 0) parts.push(`${n} cost type(s)`);
    }
    if (this.fmImportLabor) {
        const lab = this.fmImportLabor;
        const tier = this.completeProjectData.tier;
        if (lab.inkindCount > 0) {
            const inkindValue = Number(lab.inkindTotalValue) || 0;
            const inkindHours = Number(lab.inkindTotalHours) || 0;
            const inkindRate = inkindHours > 0 ? inkindValue / inkindHours : 0;
            this.completeProjectData.verifiedInkindPeople = 1;
            this.completeProjectData.verifiedInkindHours = inkindHours;
            this.completeProjectData.verifiedInkindRate = inkindRate;
            this.completeProjectData._inkindTotalValue = inkindValue;
            this.completeProjectData._inkindLogCount = lab.inkindCount;
            parts.push(`${lab.inkindCount} in-kind log(s)`);
        } else if (tier?.inkindPeople > 0 || tier?.inkindHours > 0) {
            this.completeProjectData.verifiedInkindPeople = 0;
            this.completeProjectData.verifiedInkindHours = 0;
            this.completeProjectData.verifiedInkindRate = 0;
            this.completeProjectData._inkindTotalValue = 0;
            this.completeProjectData._inkindLogCount = 0;
            parts.push('0 in-kind logs');
        }
        if (lab.communityCount > 0) {
            const communityValue = Number(lab.communityTotalValue) || 0;
            const communityHours = Number(lab.communityTotalHours) || 0;
            const communityRate = communityHours > 0 ? communityValue / communityHours : 0;
            this.completeProjectData.verifiedCommunityPeople = 1;
            this.completeProjectData.verifiedCommunityHours = communityHours;
            this.completeProjectData.verifiedCommunityRate = communityRate;
            this.completeProjectData._communityTotalValue = communityValue;
            this.completeProjectData._communityLogCount = lab.communityCount;
            parts.push(`${lab.communityCount} community log(s)`);
        } else if (tier?.communityPeople > 0 || tier?.communityHours > 0) {
            this.completeProjectData.verifiedCommunityPeople = 0;
            this.completeProjectData.verifiedCommunityHours = 0;
            this.completeProjectData.verifiedCommunityRate = 0;
            this.completeProjectData._communityTotalValue = 0;
            this.completeProjectData._communityLogCount = 0;
            parts.push('0 community logs');
        }
    }
    if (this.completeProjectData) {
        this.completeProjectData._fmFetched = true;
    }
    if (parts.length > 0) {
        this.showNotification(`Applied verified data from Finance (${parts.join(', ')}).`, "success");
    } else {
        this.showNotification('No transactions or labor logs found in Finance for this step.', 'info');
    }
    this.closeFmImportModal();
}

/** Fetch proof-marked attachments from PM for this tier. */
export async function fetchPmDocumentalProof() {
    if (!this.completeProjectData) return;
    const tierId = this.completeProjectData.tier.id;
    try {
        const records = await pb.collection('pm_card_attachments').getFullList({
            filter: `tier = "${tierId}" && is_proof = true`,
            sort: '-created',
            requestKey: null,
        });
        this.completeProjectData._pmProofItems = records
            .filter(r => r.file)
            .map(r => {
                const filename = r.file;
                const isImage = /\.(jpe?g|png|webp|gif)$/i.test(filename);
                const url = `${pb.baseUrl}/api/files/${r.collectionId}/${r.id}/${filename}`;
                return {
                    name: r.name || filename,
                    type: isImage ? 'image' : 'pdf',
                    date: new Date(r.created).toLocaleDateString(),
                    url: url,
                };
            });
        this.completeProjectData._pmProofFetched = true;
        this.showNotification(
            `${this.completeProjectData._pmProofItems.length} proof document(s) fetched from Project Manager.`,
            'success'
        );
    } catch (e) {
        console.error('[fetchPmDocumentalProof] Failed:', e);
        this.showNotification('Failed to fetch proof from PM: ' + (e?.message || e), 'error');
    }
}

export async function fetchCompletionDonations() {
    if (!this.completeProjectData) return;
    const tierId = this.completeProjectData.tier.id;
    try {
        const tier = await pb.collection('tiers').getOne(tierId, { fields: 'donations', requestKey: null });
        const donations = Array.isArray(tier.donations) ? tier.donations : [];
        // Mark all as finalized
        const finalized = donations.map(d => ({ ...d, isEstimate: false }));
        this.completeProjectData._donations = finalized;
        this.completeProjectData._donationsFetched = true;
        if (donations.length > 0) {
            const total = donations.reduce((s, d) => s + (d.value || 0), 0);
            this.showNotification(`${donations.length} donation(s) totaling $${this.formatMoney(total)} fetched.`, 'success');
        } else {
            this.showNotification('No donations recorded for this step.', 'success');
        }
    } catch (e) {
        console.error('[fetchCompletionDonations] Failed:', e);
        // Allow completion even if fetch fails
        this.completeProjectData._donations = [];
        this.completeProjectData._donationsFetched = true;
        this.showNotification('Could not fetch donations, proceeding without.', 'warning');
    }
}

// Confirm Complete Project - marks tier completed, creates project_completion budget event (no wallet, no balance change)
export async function confirmCompleteProject() {
    if (!this.completeProjectData) return;

    const data = this.completeProjectData;
    const tier = data.tier;

    const verifiedMonetaryTotal = Object.values(data.verifiedMonetaryCosts || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const allocatedAmount = tier.allocatedMonetaryCost || 0;
    const difference = allocatedAmount - verifiedMonetaryTotal;

    try {
        this.showLoading("Completing project...");

        const startedAt = tier.startedAt ? new Date(tier.startedAt) : new Date();
        const completedAt = new Date();
        const actualDays = Math.max(1, Math.round((completedAt - startedAt) / (1000 * 60 * 60 * 24)));

        // Coerce all labor values to numbers (v-model.number can leave "" on cleared fields)
        const safeInkindPeople = Number(data.verifiedInkindPeople) || 0;
        const safeInkindHours = Number(data.verifiedInkindHours) || 0;
        const safeInkindRate = Number(data.verifiedInkindRate) || 0;
        const safeCommunityPeople = Number(data.verifiedCommunityPeople) || 0;
        const safeCommunityHours = Number(data.verifiedCommunityHours) || 0;
        const safeCommunityRate = Number(data.verifiedCommunityRate) || 0;

        const tierForCalc = {
            ...tier,
            verifiedMonetaryCosts: data.verifiedMonetaryCosts,
            verifiedInkindPeople: safeInkindPeople,
            verifiedInkindHours: safeInkindHours,
            verifiedInkindRate: safeInkindRate,
            verifiedCommunityPeople: safeCommunityPeople,
            verifiedCommunityHours: safeCommunityHours,
            verifiedCommunityRate: safeCommunityRate,
            actualDays: actualDays
        };

        const riskFinal = this.computeRiskFinal(tierForCalc);
        const scoreFinal = this.computeStepScore({ ...tierForCalc, riskFinal, status: 'completed' });

        const tierUpdateData = {
            status: 'completed',
            verifiedMonetaryCosts: JSON.stringify(data.verifiedMonetaryCosts),
            verifiedInkindPeople: safeInkindPeople,
            verifiedInkindHours: safeInkindHours,
            verifiedInkindRate: safeInkindRate,
            verifiedCommunityPeople: safeCommunityPeople,
            verifiedCommunityHours: safeCommunityHours,
            verifiedCommunityRate: safeCommunityRate,
            completedAt: completedAt.toISOString(),
            actualDays: actualDays,
            riskFinal: riskFinal,
            scoreFinal: scoreFinal,
            donations: data._donations || []
        };

        if (this.noteEditorContent) {
            tierUpdateData.completionNote = this.noteEditorContent;
        }

        await pb.collection('tiers').update(tier.id, tierUpdateData);

        await this.updateRiskLearning({ ...tierForCalc, riskFinal });

        const details = difference > 0
            ? `$${this.formatMoney(difference)} reimbursed (under budget)`
            : difference < 0
                ? `$${this.formatMoney(Math.abs(difference))} additional needed (over budget)`
                : 'Costs matched allocation';
        // Only create budget event if there were monetary costs (PB rejects amount=0 on required fields)
        if (allocatedAmount > 0 || verifiedMonetaryTotal > 0) {
            try {
                await pb.collection('gm_budget_events').create({
                    event_type: 'project_completion',
                    tier: tier.id,
                    amount: difference,
                    allocated_amount: allocatedAmount,
                    verified_amount: verifiedMonetaryTotal,
                    details: `Step ${data.level} of ${data.projTitle}: ${details}`
                });
            } catch (budgetErr) {
                console.warn('[confirmCompleteProject] Budget event creation failed (non-fatal):', budgetErr?.message || budgetErr);
            }
        }

        await this.fetchProjects();
        if (typeof this.fetchFmGmWallets === 'function') await this.fetchFmGmWallets();
        if (typeof this.fetchBudgetFeed === 'function') await this.fetchBudgetFeed();

        const userName = this.getCurrentUserName();
        this.logAction(`${userName} completed step ${data.level} of project '${data.projTitle}'`);

        this.hideLoading();
        this.showCompleteProjectModal = false;
        this.completeProjectData = null;
        this.noteEditorContent = '';

        const msg = difference > 0
            ? `Project completed! ${details}`
            : difference < 0
                ? `Project completed! ${details}`
                : `Project completed! Costs matched allocation.`;
        this.showNotification(msg, "success");
    } catch (error) {
        this.hideLoading();
        console.error("Error completing project:", error);
        this.showNotification("Error: " + error.message, "error");
    }
}

// NEW: Confirm Start Project - moves tier to in_progress, creates allocation budget event (no wallet, no balance change)
export async function confirmStartProject() {
    if (!this.startProjectData) return;

    const data = this.startProjectData;

    const monetaryTotal = Object.values(data.monetaryCosts || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);

    try {
        this.showLoading("Starting project...");

        const riskEstAtStart = this.getRiskEstimate(data.tier.externalDependency);
        const scoreAtStart = this.computeStepScore(data.tier);

        const tierUpdateData = {
            status: 'in_progress',
            wallet: null,
            allocatedMonetaryCost: monetaryTotal,
            monetaryCosts: JSON.stringify(data.monetaryCosts),
            inkindPeople: data.inkindPeople,
            inkindHours: data.inkindHours,
            inkindRate: data.inkindRate,
            communityPeople: data.communityPeople,
            communityHours: data.communityHours,
            communityRate: data.communityRate,
            intervention: data.intervention,
            utility: data.utility,
            startedAt: new Date().toISOString(),
            riskEstAtStart: riskEstAtStart,
            scoreAtStart: scoreAtStart,
            algorithmSelected: false,
            donations: data.donations || []
        };

        if (this.noteEditorContent) {
            tierUpdateData.startNote = this.noteEditorContent;
        }

        await pb.collection('tiers').update(data.tier.id, tierUpdateData);

        if (monetaryTotal > 0) {
            await pb.collection('gm_budget_events').create({
                event_type: 'allocation',
                tier: data.tier.id,
                amount: monetaryTotal,
                details: `Allocation for Step ${data.level} of ${data.projTitle}`
            });
        }

        await this.fetchProjects();
        if (typeof this.fetchFmGmWallets === 'function') await this.fetchFmGmWallets();
        if (typeof this.fetchBudgetFeed === 'function') await this.fetchBudgetFeed();

        const userName = this.getCurrentUserName();
        this.logAction(`${userName} started step ${data.level} of project '${data.projTitle}'`);

        this.hideLoading();
        this.showStartProjectModal = false;
        this.startProjectData = null;
        this.noteEditorContent = '';
        const msg = monetaryTotal > 0
            ? `Project started! $${this.formatMoney(monetaryTotal)} allocated (tracked for budget).`
            : "Project started! (in-kind only)";
        this.showNotification(msg, "success");
    } catch (error) {
        this.hideLoading();
        console.error("Error starting project:", error);
        this.showNotification("Error: " + error.message, "error");
    }
}

/** Load logbook entries (only when user visits Logbook tab). Do not call on app open. */
export async function loadLogbook() {
    this.logbookLoading = true;
    this.logbookEntries = [];
    try {
        const result = await pb.collection('logbook').getList(1, 200, {
            sort: '-created',
            expand: 'user'
        });
        this.logbookEntries = result.items || [];
    } catch (e) {
        console.warn('Failed to load logbook:', e);
        this.showNotification('Could not load logbook.', 'error');
    } finally {
        this.logbookLoading = false;
    }
}

/** Derive event type from logbook action text (for filtering). */
export function getLogbookEventType(action) {
    if (!action || typeof action !== 'string') return 'Other';
    const a = action.toLowerCase();
    if (a.includes('logged in') || a.includes('logged out')) return 'Auth';
    if (a.includes('created project') || a.includes('updated project') || a.includes('deleted project') || a.includes('added a step') || a.includes('removed a step')) return 'Project';
    if (a.includes('started step') || a.includes('completed step')) return 'Step';
    if (a.includes('algorithmic selection') || a.includes('unselected')) return 'Grant';
    if (a.includes('wallet') || a.includes('transfer') || a.includes('deposit') || a.includes('withdrawal')) return 'Wallet';
    if (a.includes('scholarship')) return 'Scholarship';
    if (a.includes('exported report')) return 'Export';
    if (a.includes('saved') && a.includes('note')) return 'Note';
    if (a.includes('risk model')) return 'Risk model';
    return 'Other';
}

/** Export currently viewed logbook entries as CSV. Uses filtered list (respects filters). */
export function downloadLogbookCsv() {
    const rows = this.filteredLogbookEntries || [];
    const header = 'Date,Time,User,Action';
    const escapeCsv = (s) => {
        if (s == null) return '';
        const str = String(s);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };
    const dateStr = (d) => {
        if (!d) return '';
        try {
            return new Date(d).toLocaleString();
        } catch (e) {
            return String(d);
        }
    };
    const lines = [header];
    rows.forEach((entry) => {
        const dt = entry.created ? new Date(entry.created) : null;
        const date = dt ? dt.toLocaleDateString() : '';
        const time = dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const user = entry.expand?.user?.name || entry.expand?.user?.email || '';
        const action = entry.action || '';
        lines.push(`${escapeCsv(date)},${escapeCsv(time)},${escapeCsv(user)},${escapeCsv(action)}`);
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    a.download = `logbook_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// Project Info Modal (mirrors PM General Info card)
// ═══════════════════════════════════════════════════════════════

export async function openProjectInfoModal(project) {
    if (!project || !project.id) return;
    this.showProjectInfoModal = true;
    this.projInfoProject = project;
    this.projInfoLoading = true;
    this.projInfoError = null;
    this.projInfoActiveTab = 'overview';
    this.projInfoCoverUrl = '';
    this.projInfoDescription = '';
    this.projInfoCoordinates = null;
    this.projInfoMapCollapsed = true;
    this.projInfoCostMonetary = 0;
    this.projInfoCostInkind = 0;
    this.projInfoCostCommunity = 0;
    this.projInfoPlannedMonetary = 0;
    this.projInfoPlannedInkind = 0;
    this.projInfoPlannedCommunity = 0;
    this.projInfoActualMonetary = 0;
    this.projInfoActualInkind = 0;
    this.projInfoActualCommunity = 0;
    this.projInfoGiCardId = null;
    this.projInfoProjectPhotos = [];
    this.projInfoStepPhotos = [];
    this.projInfoPhotoViewerIndex = null;
    this.projInfoPhotoViewerList = [];
    this.projInfoChecklists = [];
    this.projInfoTodoTotal = 0;
    this.projInfoTodoDone = 0;
    this.projInfoThreads = [];
    this.projInfoSelectedThread = null;
    this.projInfoThreadComments = [];
    this.projInfoThreadCommentsLoading = false;
    this.projInfoCommentCount = 0;
    this.projInfoProjectAttachments = [];
    this.projInfoStepAttachments = [];
    this.projInfoAttachmentCount = 0;

    const projectId = project.id;
    const tiers = project.tiers || [];
    const tierIds = tiers.map(t => t.id).filter(Boolean);
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    const mapPhoto = (r) => ({
        id: r.id,
        filename: r.image || '',
        url: r.image ? pb.files.getUrl(r, r.image) : '',
        thumbUrl: r.image ? pb.files.getUrl(r, r.image, { thumb: '200x200' }) : '',
        collectionId: r.collectionId,
        context: r.context || '',
    });
    const mapAttachment = (r) => {
        const filename = r.file || '';
        return {
            id: r.id,
            file: filename,
            name: r.name || filename,
            url: filename ? pb.files.getUrl(r, filename) : '',
            isImage: IMAGE_EXTS.some(ext => filename.toLowerCase().endsWith(ext)),
            collectionId: r.collectionId,
            created: r.created,
        };
    };

    try {
        // ── Step 1: project metadata from GM data + pm_gm_metadata ──
        this.projInfoDescription = project.description || '';
        this.projInfoCoordinates = project.coordinates || null;

        // Cover image from project.mainPhoto → photos collection
        if (project.mainPhoto) {
            try {
                const coverPhoto = await pb.collection('photos').getOne(project.mainPhoto, { $autoCancel: false });
                this.projInfoCoverUrl = coverPhoto.image ? pb.files.getUrl(coverPhoto, coverPhoto.image) : '';
            } catch { this.projInfoCoverUrl = ''; }
        }

        // Fetch pm_gm_metadata for this project AND its tiers (checklists)
        const metaFilterParts = [`gm_project = "${projectId}"`];
        if (tierIds.length > 0) metaFilterParts.push(tierIds.map(id => `gm_tier = "${id}"`).join(' || '));
        const projGmMeta = await pb.collection('pm_gm_metadata').getFullList({
            filter: metaFilterParts.join(' || '),
            $autoCancel: false,
        }).catch(() => []);

        // Compute planned values (sync, no query)
        let pM = 0, pI = 0, pC = 0;
        for (const t of tiers) {
            const mc = typeof t.monetaryCosts === 'string' ? JSON.parse(t.monetaryCosts || '{}') : (t.monetaryCosts || {});
            pM += Object.values(mc).reduce((s, v) => s + (Number(v) || 0), 0);
            pI += (Number(t.inkindPeople) || 0) * (Number(t.inkindHours) || 0) * (Number(t.inkindRate) || 0);
            pC += (Number(t.communityPeople) || 0) * (Number(t.communityHours) || 0) * (Number(t.communityRate) || 0);
        }
        this.projInfoPlannedMonetary = pM;
        this.projInfoPlannedInkind = pI;
        this.projInfoPlannedCommunity = pC;
        this.projInfoCostMonetary = pM;
        this.projInfoCostInkind = pI;
        this.projInfoCostCommunity = pC;
        this.projInfoColorMonetary = '#16a34a';
        this.projInfoColorInkind = '#2563eb';
        this.projInfoColorCommunity = '#ea580c';

        // ── Group A (parallel): FM actuals, ALL photos (batched), checklists ──
        const fmActualsPromise = (async () => {
            if (tierIds.length === 0) return;
            const tierFilter = tierIds.map(id => `gm_tier = "${id}"`).join(' || ');
            const laborFilter = tierIds.map(id => `tier = "${id}"`).join(' || ');
            const [fmTxs, fmLogs] = await Promise.all([
                pb.collection('fm_transactions').getFullList({
                    filter: `(${tierFilter}) && pm_intervention = null`,
                    fields: 'id,amount,type',
                    $autoCancel: false,
                }).catch(() => []),
                pb.collection('fm_labor_logs').getFullList({
                    filter: `(${laborFilter}) && pm_intervention = null`,
                    fields: 'id,type,people,hours,rate',
                    $autoCancel: false,
                }).catch(() => []),
            ]);
            let aM = 0, aI = 0, aC = 0;
            for (const tx of fmTxs) {
                if (tx.type === 'expense') aM += Math.abs(Number(tx.amount) || 0);
            }
            for (const l of fmLogs) {
                const val = (Number(l.people) || 0) * (Number(l.hours) || 0) * (Number(l.rate) || 0);
                if (l.type === 'inkind') aI += val; else aC += val;
            }
            this.projInfoActualMonetary = aM;
            this.projInfoActualInkind = aI;
            this.projInfoActualCommunity = aC;
        })().catch(e => console.warn('projInfo: FM actuals error', e));

        const allPhotosPromise = (async () => {
            const rawPhotos = await pb.collection('photos').getFullList({
                filter: `project = "${projectId}"`,
                sort: 'order,created',
                $autoCancel: false,
            });
            this.projInfoProjectPhotos = rawPhotos.filter(r => r.context === 'project').map(mapPhoto);
            const tierPhotosMap = {};
            for (const r of rawPhotos) {
                if (!r.tier || r.context === 'project') continue;
                if (!tierPhotosMap[r.tier]) tierPhotosMap[r.tier] = [];
                tierPhotosMap[r.tier].push(mapPhoto(r));
            }
            const stepPhotoGroups = [];
            for (const tier of tiers) {
                const photos = tierPhotosMap[tier.id];
                if (!photos || photos.length === 0) continue;
                photos.sort((a, b) => (a.context === 'intervention' ? 1 : 0) - (b.context === 'intervention' ? 1 : 0));
                stepPhotoGroups.push({
                    tierId: tier.id,
                    title: `Step ${tier.level || tier.tierLevel || '?'}`,
                    photos,
                    _collapsed: true,
                });
            }
            this.projInfoStepPhotos = stepPhotoGroups;
        })().catch(e => console.warn('projInfo: photos error', e));

        const checklistsPromise = (async () => {
            const allChecklists = [];
            for (const meta of projGmMeta) {
                const cls = Array.isArray(meta.checklists) ? meta.checklists : [];
                for (const cl of cls) allChecklists.push(cl);
            }
            this.projInfoChecklists = allChecklists.map(cl => ({
                id: cl.id || '',
                title: cl.title || '',
                items: Array.isArray(cl.items) ? cl.items : [],
            }));
            let total = 0, done = 0;
            for (const cl of allChecklists) {
                const items = Array.isArray(cl.items) ? cl.items : [];
                total += items.length;
                done += items.filter(i => i.completed || i.checked).length;
            }
            this.projInfoTodoTotal = total;
            this.projInfoTodoDone = done;
        })().catch(e => console.warn('projInfo: checklists error', e));

        await Promise.all([fmActualsPromise, allPhotosPromise, checklistsPromise]);

        // Overview data is ready — stop showing the spinner so the first tab renders
        this.projInfoLoading = false;

        // ── Group B (parallel): discussions, project attachments, step attachments ──
        const discussionsPromise = (async () => {
            const rawThreads = await pb.collection('pm_threads').getFullList({
                filter: `gm_project = "${projectId}"`,
                expand: 'user',
                sort: '-lastReplyAt,-created',
                $autoCancel: false,
            });
            const threadIds = rawThreads.map(t => t.id);
            let allComments = [];
            if (threadIds.length > 0) {
                allComments = await pb.collection('pm_card_comments').getFullList({
                    filter: threadIds.map(id => `thread = "${id}"`).join(' || '),
                    expand: 'user',
                    sort: '-created',
                    $autoCancel: false,
                });
            }
            const commentsByThread = {};
            for (const c of allComments) {
                const tid = c.thread;
                if (!commentsByThread[tid]) commentsByThread[tid] = [];
                commentsByThread[tid].push(c);
            }
            this.projInfoThreads = rawThreads.map(t => {
                const user = t.expand?.user;
                const threadComments = commentsByThread[t.id] || [];
                const lastComment = threadComments[0];
                const lastUser = lastComment?.expand?.user;
                return {
                    id: t.id,
                    title: t.title || '',
                    user: t.user,
                    userName: user?.name || user?.username || user?.email || 'Unknown',
                    userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                    lastReplyAt: t.lastReplyAt || t.created,
                    created: t.created,
                    replyCount: threadComments.length,
                    lastReplyPreview: (() => { const raw = lastComment ? (lastComment.content || '').replace(/<[^>]*>/g, '').trim() : ''; return raw.length > 60 ? raw.slice(0, 60) + '...' : raw; })(),
                    lastReplyUser: lastUser?.name || lastUser?.username || '',
                };
            });
            this.projInfoCommentCount = rawThreads.length;
        })().catch(e => console.warn('projInfo: threads error', e));

        const projAttPromise = (async () => {
            const rawAtt = await pb.collection('pm_card_attachments').getFullList({
                filter: `gm_project = "${projectId}" && (attachment_type = "attachment" || attachment_type = "")`,
                sort: '-created',
                $autoCancel: false,
            });
            this.projInfoProjectAttachments = rawAtt.filter(r => r.file).map(mapAttachment);
        })().catch(e => console.warn('projInfo: project attachments error', e));

        const stepAttPromise = (async () => {
            if (tierIds.length === 0) return;
            const tierAttFilter = tierIds.map(id => `tier = "${id}"`).join(' || ');
            const rawAtt = await pb.collection('pm_card_attachments').getFullList({
                filter: tierAttFilter,
                sort: '-created',
                $autoCancel: false,
            });
            const attByTier = {};
            for (const r of rawAtt) {
                if (!r.file) continue;
                const tid = r.tier || '';
                if (!tid) continue;
                if (!attByTier[tid]) attByTier[tid] = [];
                attByTier[tid].push(mapAttachment(r));
            }
            const stepAttGroups = [];
            for (const tier of tiers) {
                const atts = attByTier[tier.id];
                if (!atts || atts.length === 0) continue;
                stepAttGroups.push({
                    tierId: tier.id,
                    title: `Step ${tier.level || tier.tierLevel || '?'}`,
                    attachments: atts,
                    _collapsed: true,
                });
            }
            this.projInfoStepAttachments = stepAttGroups;
        })().catch(e => console.warn('projInfo: step attachments error', e));

        await Promise.all([discussionsPromise, projAttPromise, stepAttPromise]);

        this.projInfoAttachmentCount = this.projInfoProjectAttachments.length
            + this.projInfoStepAttachments.reduce((sum, g) => sum + g.attachments.length, 0);

    } catch (err) {
        console.error('Failed to open Project Info modal:', err);
        this.projInfoError = err.message || 'Failed to load project data';
    } finally {
        this.projInfoLoading = false;
    }
}

export function closeProjectInfoModal() {
    this.showProjectInfoModal = false;
    this.projInfoProject = null;
    this.projInfoLoading = false;
    this.projInfoError = null;
    this.projInfoGiCardId = null;
    this.projInfoProjectPhotos = [];
    this.projInfoStepPhotos = [];
    this.projInfoPhotoViewerIndex = null;
    this.projInfoPhotoViewerList = [];
    this.projInfoChecklists = [];
    this.projInfoThreads = [];
    this.projInfoSelectedThread = null;
    this.projInfoThreadComments = [];
    this.projInfoProjectAttachments = [];
    this.projInfoStepAttachments = [];
}

export async function selectProjInfoThread(thread) {
    this.projInfoSelectedThread = thread;
    this.projInfoThreadComments = [];
    this.projInfoThreadCommentsLoading = true;
    try {
        const [rawComments, rawAttachments] = await Promise.all([
            pb.collection('pm_card_comments').getFullList({
                filter: `thread = "${thread.id}"`,
                expand: 'user',
                sort: '-created',
                $autoCancel: false,
            }),
            pb.collection('pm_card_attachments').getFullList({
                filter: `gm_project = "${this.projInfoProject?.id}"`,
                sort: 'created',
                $autoCancel: false,
            }),
        ]);
        const attachmentsByComment = {};
        for (const att of rawAttachments) {
            if (att.comment) {
                if (!attachmentsByComment[att.comment]) attachmentsByComment[att.comment] = [];
                const filename = att.file || '';
                attachmentsByComment[att.comment].push({
                    id: att.id,
                    name: att.name || filename,
                    url: filename ? pb.files.getUrl(att, filename) : '',
                    isImage: /\.(jpe?g|png|webp|gif)$/i.test(filename),
                });
            }
        }
        this.projInfoThreadComments = rawComments.map(r => {
            const user = r.expand?.user;
            return {
                id: r.id,
                userName: user?.name || user?.username || user?.email || 'Unknown',
                userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                content: r.content || '',
                created: r.created,
                attachments: attachmentsByComment[r.id] || [],
            };
        });
    } catch (err) {
        console.warn('Failed to load projInfo thread comments:', err);
    } finally {
        this.projInfoThreadCommentsLoading = false;
    }
}

export function deselectProjInfoThread() {
    this.projInfoSelectedThread = null;
    this.projInfoThreadComments = [];
}

export function openProjInfoPhotoViewer(photos, index) {
    this.projInfoPhotoViewerList = photos;
    this.projInfoPhotoViewerIndex = index;
}

export function closeProjInfoPhotoViewer() {
    this.projInfoPhotoViewerIndex = null;
    this.projInfoPhotoViewerList = [];
}
