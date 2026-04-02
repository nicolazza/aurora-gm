/**
 * Project CRUD Methods
 * ~440 lines
 */
import { pb } from '../config.js'

export function openProjectModal(proj = null) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to edit projects.", "error");
        return;
    }
    
    if (!this.hasPerm('gm.editProjectMeta') && !this.hasPerm('gm.editProjectFull') && !this.hasPerm('gm.createProjects')) {
        this.showNotification("You don't have permission to edit projects.", "error");
        return;
    }
    
    if (proj) {
        // Editing existing project
        this.modalProject = JSON.parse(JSON.stringify(proj));
        // Parse contacts from PB JSON field
        if (!this.modalProject._contacts) {
            let raw = this.modalProject.contacts;
            if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
            this.modalProject._contacts = Array.isArray(raw) ? raw : [];
        }
        // Ensure tiers have new structure
        if (!this.modalProject.tiers || this.modalProject.tiers.length === 0) {
            this.modalProject.tiers = [this.createNewTier(1)];
        } else {
            // Ensure each tier has monetaryCosts object
            this.modalProject.tiers.forEach(t => {
                if (!t.monetaryCosts) t.monetaryCosts = {};
            });
        }
        // Ensure coordinates is an object or null
        if (this.modalProject.coordinates && typeof this.modalProject.coordinates === 'string') {
            this.modalProject.coordinates = JSON.parse(this.modalProject.coordinates);
        }
        // Restore "Scoring Calc" confirmed state for tiers that already have scoring data (so the button is active after navigate-away-and-back)
        const id = this.modalProject.id;
        if (id && this.modalProject.tiers?.length) {
            let sections = { ...this.confirmedStepSections };
            this.modalProject.tiers.forEach((tier, i) => {
                if (this.computeStepScore(tier) != null) {
                    const key = `${id}-${i}`;
                    const prev = sections[key] || {};
                    sections[key] = { ...prev, impact: true };
                }
            });
            this.confirmedStepSections = sections;
        }
    } else {
        // New project: clear any previous "new-*" confirmed sections so Scoring isn't pre-checked
        const prev = this.confirmedStepSections || {};
        this.confirmedStepSections = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('new-')));
        this.modalProject = {
            id: null,
            title: '',
            category: '', // Single category relation ID
            description: '',
            location: '',
            coordinates: null,
            photos: [],
            tiers: [this.createNewTier(1)],
            _contacts: [],
        };
    }
    this.confirmRemoveTier = false;
    this.showPmResearchPicker = false;
    this.showModal = true;
    // Initialize Quill editor after modal is shown
    this.initDescriptionEditor();
}

export async function saveProject() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to save projects.", "error");
        return;
    }
    
    if (!this.hasPerm('gm.editProjectMeta') && !this.hasPerm('gm.editProjectFull') && !this.hasPerm('gm.createProjects')) {
        this.showNotification("You don't have permission to edit projects.", "error");
        return;
    }
    
    const isScholarship = this.modalProject.type === 'scholarship';
    if (isScholarship && this.modalProject.id && !this.hasPerm('gm.editProjectMeta') && !this.hasPerm('gm.editProjectFull')) {
        this.showNotification("You don't have permission to edit scholarships.", "error");
        return;
    }
    if (isScholarship && !this.modalProject.id && !this.hasPerm('gm.createScholarship')) {
        this.showNotification("You don't have permission to create scholarships.", "error");
        return;
    }
    
    if (!this.modalProject.title) {
        this.showNotification("Title required", "error");
        return;
    }

    // Require for every step: Impact confirmed AND at least one cost (monetary, in-kind, or community)
    // Skip validation for locked tiers (in_progress or completed) — they are read-only
    const tiers = this.modalProject.tiers || [];
    for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        if (tier.status === 'in_progress' || tier.status === 'completed') continue;
        const impactOk = this.isStepSectionConfirmed(i, 'impact');
        const hasMonetary = this.getTierMonetaryTotal(tier) > 0;
        const hasInkind = (tier.inkindPeople || 0) * (tier.inkindHours || 0) * (tier.inkindRate || 0) > 0;
        const hasCommunity = (tier.communityPeople || 0) * (tier.communityHours || 0) * (tier.communityRate || 0) > 0;
        const hasCost = hasMonetary || hasInkind || hasCommunity;
        if (!impactOk) {
            this.showNotification("For every step you must open Impact, set the values, and click Done before saving.", "error");
            return;
        }
        if (!hasCost) {
            this.showNotification("For every step you must add at least one cost: Monetary, In-Kind, or Community Labor.", "error");
            return;
        }
    }

    try {
        this.showLoading("Saving project...");
        // Get description from Quill editor if it exists
        if (this.descriptionEditor) {
            const html = this.descriptionEditor.root.innerHTML;
            // Check if it's just empty paragraph tags (Quill default)
            const plainText = this.stripHtml(html);
            this.modalProject.description = plainText.trim() ? html : "";
        }
        // Prepare project data
        // Photos are managed separately via photos collection
        // NEW SCHEMA: title, single category relation, photos on project
        const projectData = {
            title: this.modalProject.title,
            description: this.modalProject.description || "",
            category: this.modalProject.category || null,
            location: this.modalProject.location || "",
            coordinates: this.modalProject.coordinates ? JSON.stringify(this.modalProject.coordinates) : null,
            type: 'project',
            mainPhoto: this.modalProject.mainPhoto && (typeof this.modalProject.mainPhoto === 'string' ? this.modalProject.mainPhoto : this.modalProject.mainPhoto.id) || null
        };

        let savedProject;
        if (this.modalProject.id && typeof this.modalProject.id === 'string') {
            // Update existing project
            savedProject = await pb.collection('projects').update(this.modalProject.id, projectData);
            // Backfill project_number if missing (e.g. created before step_code feature)
            if (savedProject.project_number == null) {
                const nextNum = (this.settings.totalProjects ?? 0) + 1;
                savedProject = await pb.collection('projects').update(savedProject.id, { project_number: nextNum });
                await pb.collection('settings').update(this.settingsId, { totalProjects: nextNum });
                this.settings.totalProjects = nextNum;
            }

            // Get all existing tiers for this project
            const existingTiers = await pb.collection('tiers').getFullList({
                filter: `project = "${savedProject.id}"`
            });
            
            // Get IDs of tiers that should be kept (those in modal)
            const tierIdsToKeep = this.modalProject.tiers
                .filter(t => t.id && typeof t.id === 'string')
                .map(t => t.id);
            
            // Delete tiers that were removed from modal (but never delete locked tiers)
            for (const existingTier of existingTiers) {
                if (!tierIdsToKeep.includes(existingTier.id)) {
                    if (existingTier.status === 'in_progress' || existingTier.status === 'completed') {
                        console.warn('Skipping deletion of locked tier:', existingTier.id, existingTier.status);
                        continue;
                    }
                    try {
                        await pb.collection('tiers').delete(existingTier.id);
                    } catch (e) {
                        console.warn('Error deleting tier:', e);
                        // Continue even if deletion fails (tier might be referenced elsewhere)
                    }
                }
            }
        } else {
            // Create new project: assign project_number from settings counter
            const nextNum = (this.settings.totalProjects ?? 0) + 1;
            projectData.project_number = nextNum;
            savedProject = await pb.collection('projects').create(projectData);
            await pb.collection('settings').update(this.settingsId, { totalProjects: nextNum });
            this.settings.totalProjects = nextNum;
        }

        const userName = this.getCurrentUserName();
        const projectTitle = savedProject.title || 'project';
        if (!this.modalProject.id || typeof this.modalProject.id !== 'string') {
            this.logAction(`${userName} created project '${projectTitle}'`);
        } else {
            this.logAction(`${userName} updated project '${projectTitle}'`);
        }

        // Save tiers (create new ones or update existing ones)
        // Skip locked tiers (in_progress or completed) to prevent accidental overwrites
        const pnum = savedProject.project_number;
        const stepCodeBase = pnum != null ? String(pnum).padStart(4, '0') : '';
        for (const tier of this.modalProject.tiers) {
            if (tier.id && (tier.status === 'in_progress' || tier.status === 'completed')) continue;
            // NEW SCHEMA: tier data structure with scoring fields
            const tierData = {
                project: savedProject.id,
                level: parseInt(tier.level),
                intervention: tier.intervention || "",
                // Legacy field (kept for backwards compatibility)
                utility: parseInt(tier.utility || tier.u) || 5,
                // New scoring fields
                u: parseInt(tier.u) || 5,           // Urgency (1-10)
                b: parseInt(tier.b) || 3,           // Breadth (1-5)
                d: parseInt(tier.d) || 3,           // Depth (1-5)
                n: parseInt(tier.n) || 3,           // Neglectedness (1-5)
                k: parseFloat(tier.k) || 0.9,       // Confidence (0.6-1.0)
                emergency: !!tier.emergency,        // Verified emergency flag
                externalDependency: !!tier.externalDependency,  // Depends on third parties
                estDays: parseInt(tier.estDays) || 7,   // Estimated duration
                // Monetary and labor costs
                monetaryCosts: JSON.stringify(tier.monetaryCosts || {}),
                inkindPeople: parseInt(tier.inkindPeople) || 0,
                inkindHours: parseInt(tier.inkindHours) || 0,
                inkindRate: parseFloat(tier.inkindRate) || 0,
                communityPeople: parseInt(tier.communityPeople) || 0,
                communityHours: parseInt(tier.communityHours) || 0,
                communityRate: parseFloat(tier.communityRate) || 0,
                donations: tier.donations || [],
                status: tier.status || 'backlog',
                step_code: stepCodeBase ? stepCodeBase + '-' + parseInt(tier.level) : ''
            };

            if (tier.id && typeof tier.id === 'string') {
                // Update existing tier (preserve proof if it exists)
                try {
                    const existingTier = await pb.collection('tiers').getOne(tier.id);
                    if (existingTier.proof) {
                        delete tierData.proof;
                    }
                } catch (e) { /* tier might be new */ }
                await pb.collection('tiers').update(tier.id, tierData);
            } else {
                // Create new tier
                await pb.collection('tiers').create(tierData);
                this.logAction(`${userName} added a step to project '${projectTitle}'`);
            }
        }

        // If this project was imported from PM research, link photos and mark as converted
        if (this.modalProject._pmResearchListId && savedProject) {
            await this.linkPmResearchAfterSave(savedProject.id);
        }

        this.showModal = false;
        await this.fetchProjects();
        this.hideLoading();
        this.showNotification("Project saved successfully!", "success");
    } catch (error) {
        console.error("Error saving project:", error);
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

export async function deleteProject(id) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to delete projects.", "error");
        return;
    }
    
    if (!this.hasPerm('gm.deleteProjects')) {
        this.showNotification("You don't have permission to delete projects.", "error");
        return;
    }
    
    try {
        const proj = this.projects.find(p => p.id === id);
        const projectTitle = proj?.title || 'project';

        // Guard: prevent deletion if any tier is in_progress or completed
        if (proj && proj.tiers && proj.tiers.some(t => t.status === 'in_progress' || t.status === 'completed')) {
            this.showNotification("Cannot delete this project because it has steps that are in progress or completed. Remove only backlog steps.", "error");
            return;
        }

        this.showLoading("Deleting project...");
        // Delete associated tiers first
        const tiers = await pb.collection('tiers').getFullList({
            filter: `project = "${id}"`
        });
        for (const tier of tiers) {
            // Double-check: never delete locked tiers
            if (tier.status === 'in_progress' || tier.status === 'completed') {
                this.hideLoading();
                this.showNotification("Cannot delete: a step is in progress or completed.", "error");
                return;
            }
            await pb.collection('tiers').delete(tier.id);
        }
        // Delete project
        await pb.collection('projects').delete(id);
        const userName = this.getCurrentUserName();
        this.logAction(`${userName} deleted project '${projectTitle}'`);
        await this.fetchProjects();
        this.hideLoading();
        this.showNotification("Project deleted successfully!", "success");
    } catch (error) {
        console.error("Error deleting project:", error);
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

export function toggleExpand(proj) {
    proj.expanded = !proj.expanded;

    // When expanding, fire-and-forget fetch of PM stats for each tier
    if (proj.expanded && proj.tiers?.length) {
        fetchPmStatsForTiers(proj.tiers);
    }
}

/**
 * Batch-fetch PM step-level counts (todos, transactions, interventions, discussions)
 * for each tier in the array. Results are stored reactively on tier._pmStats.
 */
export async function fetchPmStatsForTiers(tiers) {
    try {
        const tierIds = tiers.map(t => t.id);

        // 1. Fetch pm_gm_metadata (checklists) for these tiers
        const tierFilter = tierIds.map(id => `gm_tier = "${id}"`).join(' || ');
        const laborFilter = tierIds.map(id => `tier = "${id}"`).join(' || ');
        const [pmMetadata, fmTxs, fmLaborLogs] = await Promise.all([
            pb.collection('pm_gm_metadata').getFullList({
                filter: tierFilter,
                fields: 'id,gm_tier,checklists',
                $autoCancel: false,
            }).catch(() => []),
            // 2. Transaction counts from fm_transactions (direct by gm_tier)
            pb.collection('fm_transactions').getFullList({
                filter: tierFilter.replace(/gm_tier/g, 'gm_tier'),
                fields: 'id,gm_tier',
                $autoCancel: false,
            }).catch(() => []),
            // 2b. Labor log counts from fm_labor_logs (by tier)
            pb.collection('fm_labor_logs').getFullList({
                filter: laborFilter,
                fields: 'id,tier',
                $autoCancel: false,
            }).catch(() => []),
        ]);

        // Map pm_gm_metadata by gm_tier
        const pmMetaByTier = {};
        for (const m of pmMetadata) {
            pmMetaByTier[m.gm_tier] = m;
        }

        // Count fm_transactions + fm_labor_logs by tier
        const txCountByTier = {};
        for (const tx of fmTxs) {
            txCountByTier[tx.gm_tier] = (txCountByTier[tx.gm_tier] || 0) + 1;
        }
        for (const ll of fmLaborLogs) {
            txCountByTier[ll.tier] = (txCountByTier[ll.tier] || 0) + 1;
        }

        // 3. Batch-fetch comment & intervention counts by gm_tier
        let commentCountByTier = {};
        let interventionCountByTier = {};

        const [comments, interventions] = await Promise.all([
            pb.collection('pm_card_comments').getFullList({
                filter: tierFilter,
                fields: 'id,gm_tier',
                $autoCancel: false,
            }).catch(() => []),
            pb.collection('pm_interventions').getFullList({
                filter: tierFilter,
                fields: 'id,gm_tier',
                $autoCancel: false,
            }).catch(() => []),
        ]);
        for (const c of comments) {
            commentCountByTier[c.gm_tier] = (commentCountByTier[c.gm_tier] || 0) + 1;
        }
        for (const iv of interventions) {
            interventionCountByTier[iv.gm_tier] = (interventionCountByTier[iv.gm_tier] || 0) + 1;
        }

        // 4. Batch-fetch photo counts per tier from `photos` collection
        let photoCountByTier = {};
        try {
            const allPhotos = await pb.collection('photos').getFullList({
                filter: tierFilter.replace(/gm_tier/g, 'tier'),
                fields: 'id,tier',
                $autoCancel: false,
            });
            for (const p of allPhotos) {
                photoCountByTier[p.tier] = (photoCountByTier[p.tier] || 0) + 1;
            }
        } catch { /* ignore */ }

        // 5. Batch-fetch attachment counts per tier from `pm_card_attachments` collection
        let attachmentCountByTier = {};
        try {
            const tierAttFilter = tierIds.map(id => `tier = "${id}"`).join(' || ');
            const allAtts = await pb.collection('pm_card_attachments').getFullList({
                filter: tierAttFilter,
                fields: 'id,tier',
                $autoCancel: false,
            });
            for (const a of allAtts) {
                if (a.tier) {
                    attachmentCountByTier[a.tier] = (attachmentCountByTier[a.tier] || 0) + 1;
                }
            }
        } catch { /* ignore */ }

        // 6. Assign _pmStats to each tier (Vue reactivity picks this up)
        for (const tier of tiers) {
            const meta = pmMetaByTier[tier.id];
            const checklists = meta ? (Array.isArray(meta.checklists) ? meta.checklists : []) : [];
            let todoTotal = 0, todoDone = 0;
            for (const cl of checklists) {
                const items = Array.isArray(cl.items) ? cl.items : [];
                todoTotal += items.length;
                todoDone += items.filter(i => i.completed || i.checked).length;
            }
            tier._pmStats = {
                todoDone,
                todoTotal,
                txCount: txCountByTier[tier.id] || 0,
                interventionCount: interventionCountByTier[tier.id] || 0,
                discussionCount: commentCountByTier[tier.id] || 0,
                photoCount: photoCountByTier[tier.id] || 0,
                attachmentCount: attachmentCountByTier[tier.id] || 0,
            };
        }
    } catch (err) {
        console.warn('[fetchPmStatsForTiers] Failed:', err);
    }
}

export function getProjectProgress(proj) {
    if (!proj.tiers || proj.tiers.length === 0) return 0;
    // NEW: Simple tier-based progress
    const completed = proj.tiers.filter(t => t.status === 'completed').length;
    return (completed / proj.tiers.length) * 100;
}

// NEW: Get count of completed tiers
export function getCompletedTiersCount(proj) {
    if (!proj.tiers || proj.tiers.length === 0) return 0;
    return proj.tiers.filter(t => t.status === 'completed').length;
}

// NEW: Get tiers that are in_progress
export function getWorkInProgressTiers(proj) {
    if (!proj.tiers) return [];
    return proj.tiers.filter(t => t.status === 'in_progress');
}

// NEW: Get total monetary costs for a project (sum of all tiers)
// Uses verified values for completed tiers, planned values for others
export function getProjectTotalMonetary(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => {
        return sum + this.getTierDisplayMonetary(t);
    }, 0);
}

// NEW: Get total in-kind hours for a project
// Uses verified values for completed tiers, planned values for others
export function getProjectTotalInkindHours(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => {
        if (t.status === 'completed') {
            return sum + ((t.verifiedInkindPeople || 0) * (t.verifiedInkindHours || 0));
        }
        return sum + ((t.inkindPeople || 0) * (t.inkindHours || 0));
    }, 0);
}

// NEW: Get total community hours for a project
// Uses verified values for completed tiers, planned values for others
export function getProjectTotalCommunityHours(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => {
        if (t.status === 'completed') {
            return sum + ((t.verifiedCommunityPeople || 0) * (t.verifiedCommunityHours || 0));
        }
        return sum + ((t.communityPeople || 0) * (t.communityHours || 0));
    }, 0);
}

// NEW: Get total in-kind labor VALUE ($) for a project
// Uses verified values for completed tiers, planned values for others
export function getProjectTotalInkindValue(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => {
        if (t.status === 'completed') {
            return sum + ((t.verifiedInkindPeople || 0) * (t.verifiedInkindHours || 0) * (t.verifiedInkindRate || 0));
        }
        return sum + ((t.inkindPeople || 0) * (t.inkindHours || 0) * (t.inkindRate || 0));
    }, 0);
}

// NEW: Get total community labor VALUE ($) for a project
// Uses verified values for completed tiers, planned values for others
export function getProjectTotalCommunityValue(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => {
        if (t.status === 'completed') {
            return sum + ((t.verifiedCommunityPeople || 0) * (t.verifiedCommunityHours || 0) * (t.verifiedCommunityRate || 0));
        }
        return sum + ((t.communityPeople || 0) * (t.communityHours || 0) * (t.communityRate || 0));
    }, 0);
}

export function getProjectTotalDonations(proj) {
    if (!proj.tiers) return 0;
    return proj.tiers.reduce((sum, t) => sum + this.getTierDonationTotal(t), 0);
}

// Get TOTAL project value (monetary + in-kind $ + community $ + donations)
export function getProjectTotalValue(proj) {
    return this.getProjectTotalMonetary(proj) + this.getProjectTotalInkindValue(proj) + this.getProjectTotalCommunityValue(proj) + this.getProjectTotalDonations(proj);
}

// NEW: Get display monetary total for a tier (verified if completed and non-zero, otherwise planned)
export function getTierDisplayMonetary(tier) {
    if (tier.status === 'completed' && tier.verifiedMonetaryCosts) {
        const costs = typeof tier.verifiedMonetaryCosts === 'string' 
            ? JSON.parse(tier.verifiedMonetaryCosts) 
            : tier.verifiedMonetaryCosts;
        const total = Object.values(costs || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        if (total > 0) return total;
    }
    return this.getTierMonetaryTotal(tier);
}

// NEW: Get display inkind hours for a tier (verified if completed, planned otherwise)
export function getTierDisplayInkindHours(tier) {
    if (tier.status === 'completed') {
        return (tier.verifiedInkindPeople || 0) * (tier.verifiedInkindHours || 0);
    }
    return (tier.inkindPeople || 0) * (tier.inkindHours || 0);
}

// NEW: Get display community hours for a tier (verified if completed, planned otherwise)
export function getTierDisplayCommunityHours(tier) {
    if (tier.status === 'completed') {
        return (tier.verifiedCommunityPeople || 0) * (tier.verifiedCommunityHours || 0);
    }
    return (tier.communityPeople || 0) * (tier.communityHours || 0);
}

// NEW: Get display inkind dollar value for a tier (verified if completed, planned otherwise)
export function getTierDisplayInkindValue(tier) {
    if (tier.status === 'completed') {
        return (tier.verifiedInkindPeople || 0) * (tier.verifiedInkindHours || 0) * (tier.verifiedInkindRate || 0);
    }
    return (tier.inkindPeople || 0) * (tier.inkindHours || 0) * (tier.inkindRate || 0);
}

// NEW: Get display community dollar value for a tier (verified if completed, planned otherwise)
export function getTierDisplayCommunityValue(tier) {
    if (tier.status === 'completed') {
        return (tier.verifiedCommunityPeople || 0) * (tier.verifiedCommunityHours || 0) * (tier.verifiedCommunityRate || 0);
    }
    return (tier.communityPeople || 0) * (tier.communityHours || 0) * (tier.communityRate || 0);
}

// NEW: Get total tier value (monetary + in-kind $ + community $)
export function getTierDonationTotal(tier) {
    return (tier.donations || []).reduce((sum, d) => sum + (d.value || 0), 0);
}

export function getTierTotalValue(tier) {
    return this.getTierDisplayMonetary(tier) + this.getTierDisplayInkindValue(tier) + this.getTierDisplayCommunityValue(tier) + this.getTierDonationTotal(tier);
}

// NEW: Get cost breakdown for a tier (for budget breakdown popover)
// Returns array of { id, name, amount } objects
// Uses verified costs for completed tiers (if non-zero), planned costs otherwise
export function getCostBreakdown(tier) {
    const isCompleted = tier.status === 'completed';
    let costsJson = tier.monetaryCosts; // default to planned
    if (isCompleted && tier.verifiedMonetaryCosts) {
        const vc = typeof tier.verifiedMonetaryCosts === 'string' ? (() => { try { return JSON.parse(tier.verifiedMonetaryCosts); } catch { return {}; } })() : (tier.verifiedMonetaryCosts || {});
        const vcTotal = Object.values(vc).reduce((s, v) => s + (Number(v) || 0), 0);
        if (vcTotal > 0) costsJson = tier.verifiedMonetaryCosts;
    }
    
    // Parse JSON if needed
    if (typeof costsJson === 'string') {
        try {
            costsJson = JSON.parse(costsJson);
        } catch (e) {
            costsJson = {};
        }
    }
    
    if (!costsJson || typeof costsJson !== 'object') {
        return [];
    }
    
    // Map costTypeId to cost type name
    const result = [];
    for (const [costTypeId, amount] of Object.entries(costsJson)) {
        const numAmount = Number(amount) || 0;
        if (numAmount > 0) {
            const costType = this.costTypes.find(ct => ct.id === costTypeId);
            result.push({
                id: costTypeId,
                name: costType ? this.getCostTypeName(costType.name) : this.getCostTypeName('Unknown') || 'Unknown',
                amount: numAmount
            });
        }
    }
    
    // Sort by cost type order (if available)
    result.sort((a, b) => {
        const orderA = this.costTypes.find(ct => ct.id === a.id)?.order || 999;
        const orderB = this.costTypes.find(ct => ct.id === b.id)?.order || 999;
        return orderA - orderB;
    });
    
    return result;
}

// NEW: Get all tiers that are in_progress (for Project Confirmation page)
export function getProjectConfirmationTiers() {
    const result = [];
    this.projects.forEach(proj => {
        if (proj.tiers) {
            proj.tiers.forEach(tier => {
                if (tier.status === 'in_progress') {
                    result.push({
                        project: proj,
                        tier: tier
                    });
                }
            });
        }
    });
    return result;
}

// NEW: Get all backlog tiers (for Project Queue page)
// Only returns eligible (first incomplete) steps per project
// Sorts: algorithmSelected tiers first (by score), then non-selected (by score)
export function getBacklogTiers() {
    const result = [];
    this.projects.forEach(proj => {
        if (proj.type === 'scholarship') return;
        if (!proj.tiers) return;
        
        // Only get the first eligible (incomplete) step for this project
        const eligibleStep = this.getEligibleStep(proj);
        if (!eligibleStep) return;
        
        // Skip if already in progress
        if (eligibleStep.status === 'in_progress') return;
        
        // Get score breakdown
        const score = this.computeStepScore(eligibleStep);
        const breakdown = this.getScoreBreakdown(eligibleStep);
        
        result.push({
            project: proj,
            tier: eligibleStep,
            projId: proj.id,
            projTitle: proj.title,
            level: eligibleStep.level,
            intervention: eligibleStep.intervention,
            // Legacy field for backwards compatibility
            utility: eligibleStep.utility || eligibleStep.u || 5,
            // New scoring fields
            score: score,
            breakdown: breakdown,
            monetaryTotal: this.getTierMonetaryTotal(eligibleStep),
            baseCost: this.computeBaseCost(eligibleStep),
            inkindHours: (eligibleStep.inkindPeople || 0) * (eligibleStep.inkindHours || 0),
            communityHours: (eligibleStep.communityPeople || 0) * (eligibleStep.communityHours || 0),
            // Algorithm selection flag
            algorithmSelected: eligibleStep.algorithmSelected || false,
            algorithmSelectionType: eligibleStep.algorithmSelectionType || null
        });
    });
    // Sort: algorithmSelected tiers first (by score), then non-selected (by score)
    return result.sort((a, b) => {
        // First, sort by algorithmSelected (true comes first)
        if (a.algorithmSelected && !b.algorithmSelected) return -1;
        if (!a.algorithmSelected && b.algorithmSelected) return 1;
        // Then sort by score descending (null = no cost data = lowest priority)
        return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    });
}

export function getCurrentScore(proj) {
    if (proj.type === 'scholarship') return 0;
    if (!proj.tiers) return 0;
    
    // Find the eligible (first incomplete) step for this project
    const eligibleStep = this.getEligibleStep(proj);
    if (!eligibleStep) return 0;
    
    // Use the new scoring algorithm
    return this.computeStepScore(eligibleStep);
}

export function getTotalCost(proj) {
    if (proj.type === 'scholarship') return proj.scholarshipValue || 0;
    if (!proj.tiers || proj.tiers.length === 0) return 0;
    // Use tier.cost when set; otherwise derive from monetaryCosts + in-kind + community (current architecture)
    return proj.tiers.reduce((acc, t) => {
        const cost = (t.cost != null && t.cost !== '') ? (t.cost - (t.laborFunded || 0)) : this.getTierTotalValue(t);
        return acc + (cost || 0);
    }, 0);
}

export function getTotalLabor(proj) {
    if (proj.type === 'scholarship' || !proj.tiers) return 0;
    return proj.tiers.reduce((acc, t) => acc + (t.laborFunded || 0), 0);
}

export function getDaysOld(dateStr) {
    if (!dateStr) {
        console.warn('getDaysOld called with undefined/null dateStr');
        return 0;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        console.warn('getDaysOld: Invalid date string:', dateStr);
        return 0;
    }
    const days = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    return Math.max(0, days); // Ensure non-negative
}

// Get project creation date (uses PocketBase's built-in created field)
export function getProjectCreatedDate(proj) {
    return proj.created;
}

// Helper to create a new tier with proper structure
export function createNewTier(level) {
    return {
        level: level,
        intervention: '',
        // Legacy field (kept for backwards compatibility during migration)
        utility: 5,
        // New scoring fields
        u: 5,           // Urgency (1-10)
        b: 3,           // Breadth (1-5)
        d: 3,           // Depth (1-5)
        n: 3,           // Neglectedness (1-5)
        k: 0.9,         // Confidence (0.6-1.0)
        emergency: false,       // Verified emergency flag
        externalDependency: false,  // Depends on third parties
        estDays: 7,     // Estimated duration in days
        // Monetary and labor costs
        monetaryCosts: {},
        inkindPeople: 0,
        inkindHours: 0,
        inkindRate: 0,
        communityPeople: 0,
        communityHours: 0,
        communityRate: 0,
        status: 'backlog'
    };
}

export function addTier() {
    if (this.modalProject.tiers.length >= 3) return;
    this.modalProject.tiers.push(this.createNewTier(this.modalProject.tiers.length + 1));
}

// Helper to calculate total monetary costs for a tier
export function getTierMonetaryTotal(tier) {
    if (!tier || !tier.monetaryCosts) return 0;
    return Object.values(tier.monetaryCosts).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

export function removeTier() {
    if (this.modalProject.tiers.length > 1) {
        const tierToRemove = this.modalProject.tiers[this.modalProject.tiers.length - 1];

        // Guard: never remove a locked tier
        if (tierToRemove.status === 'in_progress' || tierToRemove.status === 'completed') {
            this.showNotification("Cannot remove a step that is in progress or completed.", "error");
            return;
        }
        
        // Check if removing this tier would make the project completed
        const remainingTiers = this.modalProject.tiers.slice(0, -1); // All tiers except the one to remove
        const wouldBeCompleted = remainingTiers.length > 0 && remainingTiers.every(t => {
            return t.status === 'completed' && this.hasProof(t);
        });
        
        let confirmMessage = "This tier exists on the server. Delete it permanently?";
        if (wouldBeCompleted) {
            confirmMessage = "⚠️ WARNING: Removing this tier will move the project to 'Completed' because all remaining tiers are fully funded and proofed. Delete it permanently?";
        }
        
        if (tierToRemove.id) {
            // Tier exists on server - confirm deletion
            this.showConfirm(confirmMessage, async () => {
                try {
                    console.log('Attempting to delete tier:', tierToRemove.id);
                    await pb.collection('tiers').delete(tierToRemove.id);
                    console.log('Tier deleted successfully');
                    const userName = this.getCurrentUserName();
                    const projectTitle = this.modalProject.title || 'project';
                    this.logAction(`${userName} removed a step from project '${projectTitle}'`);
                    // Remove from modal array after successful deletion
                    this.modalProject.tiers.pop();
                    if (wouldBeCompleted) {
                        this.showNotification("Step removed. Project moved to Completed section.", "info");
                    } else {
                        this.showNotification("Step removed successfully.", "success");
                    }
                } catch (e) {
                    console.error('Error deleting tier:', e);
                    console.error('Tier ID:', tierToRemove.id);
                    console.error('Tier object:', tierToRemove);
                    
                    if (e.status === 403) {
                        this.showNotification("You don't have permission to delete steps. Only admins can delete tiers.", "error");
                    } else if (e.status === 404) {
                        // Tier doesn't exist - might have been already deleted, just remove from UI
                        console.warn('Tier not found (404) - removing from UI anyway');
                        this.modalProject.tiers.pop();
                        this.showNotification("Step removed from project (was already deleted).", "info");
                    } else {
                        this.showNotification("Error deleting step: " + (e.message || 'Unknown error'), "error");
                    }
                }
            });
        } else {
            // New tier not yet saved - check if removal would complete project
            if (wouldBeCompleted) {
                this.showConfirm("⚠️ WARNING: Removing this tier will move the project to 'Completed' because all remaining tiers are fully funded and proofed. Continue?", () => {
                    this.modalProject.tiers.pop();
                    this.showNotification("Step removed. Project will be moved to Completed when saved.", "info");
                });
            } else {
                // Just remove from array
                this.modalProject.tiers.pop();
            }
        }
    } else {
        // Only one tier left - warn that this will create an empty project
        this.showConfirm("⚠️ WARNING: This is the last tier. Removing it will leave the project with no steps. Continue?", () => {
            this.modalProject.tiers.pop();
        });
    }
}

export function getTierFundedDate(projId, level) {
    let relevantTx = this.transactions
        .filter(t => t.type === 'GRANT')
        .reverse()
        .find(t => {
            if (!t.details) return false;
            // Handle details as array or object
            const details = Array.isArray(t.details) ? t.details : (t.details ? [t.details] : []);
            return details.some(d => d.projId === projId && d.level === level);
        });
    if (relevantTx) return new Date(relevantTx.date).toLocaleDateString();

    const project = this.projects.find(p => p.id === projId);
    if (project) {
        let relevantInKind = this.transactions
            .filter(t => t.type === 'WITHDRAW' && t.description && t.description.includes('In-Kind Exec'))
            .reverse()
            .find(t => t.description.includes(project.title) && t.description.includes(`Step ${level}`));
        if (relevantInKind) return new Date(relevantInKind.date).toLocaleDateString();
    }
    return 'N/A';
}

export function getProjectCompletedDate(proj) {
    if (proj.type === 'scholarship') return new Date(this.getProjectCreatedDate(proj)).toLocaleDateString();
    
    // NEW: Check for completed tiers' completedAt timestamp
    if (proj.tiers && proj.tiers.length > 0) {
        const completedTiers = proj.tiers.filter(t => t.status === 'completed' && t.completedAt);
        if (completedTiers.length > 0) {
            // Get the most recent completedAt date
            const latestDate = completedTiers
                .map(t => new Date(t.completedAt))
                .sort((a, b) => b - a)[0];
            return latestDate.toLocaleDateString();
        }
    }
    
    // Fallback to old transaction-based logic
    let relevantGrant = this.transactions
        .filter(t => t.type === 'GRANT')
        .reverse()
        .find(t => {
            if (!t.details) return false;
            const details = Array.isArray(t.details) ? t.details : (t.details ? [t.details] : []);
            return details.some(d => d.projId === proj.id);
        });
    if (relevantGrant) return new Date(relevantGrant.date).toLocaleDateString();

    let relevantInKind = this.transactions
        .filter(t => t.type === 'WITHDRAW' && t.description && t.description.includes('In-Kind Exec') && t.description.includes(proj.title))
        .reverse()[0];
    if (relevantInKind) return new Date(relevantInKind.date).toLocaleDateString();

    return 'N/A';
}

// Get completion date as Date object for sorting (falls back to creation date if not completed)
export function getProjectCompletedDateForSort(proj) {
    if (proj.type === 'scholarship') return new Date(this.getProjectCreatedDate(proj));
    
    // NEW: Check for completed tiers' completedAt timestamp
    if (proj.tiers && proj.tiers.length > 0) {
        const completedTiers = proj.tiers.filter(t => t.status === 'completed' && t.completedAt);
        if (completedTiers.length > 0) {
            // Get the most recent completedAt date
            return completedTiers
                .map(t => new Date(t.completedAt))
                .sort((a, b) => b - a)[0];
        }
    }
    
    // Fallback to old transaction-based logic
    let relevantGrant = this.transactions
        .filter(t => t.type === 'GRANT')
        .reverse()
        .find(t => {
            if (!t.details) return false;
            const details = Array.isArray(t.details) ? t.details : (t.details ? [t.details] : []);
            return details.some(d => d.projId === proj.id);
        });
    if (relevantGrant) return new Date(relevantGrant.date);

    let relevantInKind = this.transactions
        .filter(t => t.type === 'WITHDRAW' && t.description && t.description.includes('In-Kind Exec') && t.description.includes(proj.title))
        .reverse()[0];
    if (relevantInKind) return new Date(relevantInKind.date);

    // Fallback to creation date if no completion date found
    return new Date(this.getProjectCreatedDate(proj));
}

/** Open step section modal (Impact / Monetary / In-Kind / Community) in project modal */
export function openStepSectionModal(tierIndex, section) {
    this.stepModalTierIndex = tierIndex;
    this.stepModalSection = section;
}

/** Close step section modal (marks that section as confirmed for this tier) */
export function closeStepSectionModal() {
    if (this.stepModalSection != null && this.stepModalTierIndex != null && this.modalProject?.tiers?.[this.stepModalTierIndex]) {
        const key = `${this.modalProject.id ?? 'new'}-${this.stepModalTierIndex}`;
        const prev = this.confirmedStepSections[key] || {};
        this.confirmedStepSections = { ...this.confirmedStepSections, [key]: { ...prev, [this.stepModalSection]: true } };
    }
    this.stepModalSection = null;
    this.stepModalTierIndex = null;
}

/** Whether the user has confirmed (clicked Done) the given step section for this tier in the project modal */
export function isStepSectionConfirmed(tierIndex, section) {
    if (!this.modalProject?.tiers) return false;
    const key = `${this.modalProject.id ?? 'new'}-${tierIndex}`;
    return this.confirmedStepSections[key]?.[section] === true;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PM Research Import
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch confirmed, unconverted research lists from PM.
 * Populates `this.pmResearchLists` for the selection dropdown.
 */
export async function fetchPmResearchLists() {
    try {
        this.pmResearchLoading = true;
        const lists = await pb.collection('pm_lists').getFullList({
            filter: 'research_confirmed = true && (converted_to_project = "" || converted_to_project = null)',
            sort: '-created',
            requestKey: null,
        });
        // Resolve category names
        const catIds = [...new Set(lists.map(l => l.research_category).filter(Boolean))];
        const catMap = {};
        if (catIds.length) {
            const cats = await pb.collection('categories').getFullList({ requestKey: null });
            cats.forEach(c => { catMap[c.id] = c; });
        }
        this.pmResearchLists = lists.map(l => ({
            id: l.id,
            title: l.title,
            categoryId: l.research_category || null,
            categoryName: catMap[l.research_category]?.name || null,
            categoryColor: catMap[l.research_category]?.color || null,
        }));
    } catch (e) {
        console.error('[PM Import] Failed to fetch research lists:', e);
        this.showNotification('Failed to load PM research projects.', 'error');
        this.pmResearchLists = [];
    } finally {
        this.pmResearchLoading = false;
    }
}

/**
 * Load a selected PM research list into the current modal form.
 * Populates title, category, description, coordinates, and tiers.
 */
export async function importPmResearch(listId) {
    if (!listId) return;
    try {
        this.showLoading('Loading research data...');

        // Fetch the list record
        const listRecord = await pb.collection('pm_lists').getOne(listId, { requestKey: null });

        // Fetch cards for this list
        const cards = await pb.collection('pm_cards').getFullList({
            filter: `list = "${listId}"`,
            requestKey: null,
        });

        const generalInfoCard = cards.find(c => c.research_card_type === 'general_info');
        const stepsCard = cards.find(c => c.research_card_type === 'proposed_steps');

        // ── Populate project-level fields ──
        this.modalProject.title = listRecord.title || '';
        this.modalProject.category = listRecord.research_category || '';

        // Description (from General Info card metadata)
        const metadata = generalInfoCard?.metadata || {};
        const desc = metadata.researchDescription || '';
        this.modalProject.description = desc;

        // Coordinates
        const coords = metadata.researchCoordinates || null;
        this.modalProject.coordinates = coords;

        // Store the PM research list ID so we can mark it as converted after save
        this.modalProject._pmResearchListId = listId;
        // Store the General Info card ID for photo linking
        this.modalProject._pmResearchCardId = generalInfoCard?.id || null;

        // ── Populate tiers from proposed steps ──
        const proposedSteps = stepsCard?.metadata?.proposedSteps || [];
        if (proposedSteps.length > 0) {
            const tiers = proposedSteps.map((step, idx) => {
                // Convert monetaryCosts from string values to numbers
                const mc = {};
                if (step.monetaryCosts && typeof step.monetaryCosts === 'object') {
                    Object.entries(step.monetaryCosts).forEach(([k, v]) => {
                        mc[k] = Number(v) || 0;
                    });
                }
                return {
                    level: idx + 1,
                    intervention: step.intervention || '',
                    utility: parseInt(step.urgency) || 5,
                    u: parseInt(step.urgency) || 5,
                    b: parseInt(step.breadth) || 3,
                    d: parseInt(step.depth) || 3,
                    n: parseInt(step.neglectedness) || 3,
                    k: parseFloat(step.confidence) || 0.9,
                    emergency: !!step.emergency,
                    externalDependency: !!step.externalDependency,
                    estDays: parseInt(step.estDays) || 7,
                    monetaryCosts: mc,
                    inkindPeople: parseInt(step.inkindPeople) || 0,
                    inkindHours: parseInt(step.inkindHours) || 0,
                    inkindRate: parseFloat(step.inkindRate) || 0,
                    communityPeople: parseInt(step.communityPeople) || 0,
                    communityHours: parseInt(step.communityHours) || 0,
                    communityRate: parseFloat(step.communityRate) || 0,
                    donations: (step.expectedDonations || []).map(d => ({
                        ...d,
                        isEstimate: true,
                    })),
                    status: 'backlog',
                };
            });
            this.modalProject.tiers = tiers;

            // Auto-confirm impact sections (data came from PM, already validated)
            const sections = { ...this.confirmedStepSections };
            tiers.forEach((_, i) => {
                const key = `new-${i}`;
                sections[key] = { impact: true };
            });
            this.confirmedStepSections = sections;
        }

        // Re-initialize Quill editor with the imported description
        this.$nextTick(() => {
            if (this.descriptionEditor && desc) {
                this.descriptionEditor.root.innerHTML = desc;
            }
        });

        this.hideLoading();
        this.showNotification('Research data imported. Review and save when ready.', 'success');
        this.showPmResearchPicker = false;
    } catch (e) {
        console.error('[PM Import] Failed to import research:', e);
        this.hideLoading();
        this.showNotification('Failed to import research data: ' + (e.message || ''), 'error');
    }
}

/**
 * After saving a new project that was imported from PM research:
 * - Link photos (set project ID on photo records)
 * - Set mainPhoto on the project
 * - Mark the research list as converted
 */
export async function linkPmResearchAfterSave(savedProjectId) {
    const listId = this.modalProject?._pmResearchListId;
    const cardId = this.modalProject?._pmResearchCardId;
    if (!listId) return;

    try {
        // Fetch all research cards for the list
        const researchCards = await pb.collection('pm_cards').getFullList({
            filter: `list = "${listId}"`,
            requestKey: null,
        });
        const allCardIds = researchCards.map(c => c.id);

        // Link photos: update photos with pm_card = cardId to have project = savedProjectId
        if (cardId) {
            const photos = await pb.collection('photos').getFullList({
                filter: `pm_card = "${cardId}" && context = "project"`,
                requestKey: null,
            });
            for (const photo of photos) {
                await pb.collection('photos').update(photo.id, { project: savedProjectId });
            }
            const mainPhoto = photos.find(p => p.isMain) || photos[0];
            if (mainPhoto) {
                await pb.collection('projects').update(savedProjectId, { mainPhoto: mainPhoto.id });
            }
        }

        // Backfill gm_project on PM threads so GM project info can find them
        if (allCardIds.length > 0) {
            const cardFilter = allCardIds.map(id => `card = "${id}"`).join(' || ');
            const threads = await pb.collection('pm_threads').getFullList({
                filter: cardFilter,
                requestKey: null,
            });
            for (const t of threads) {
                await pb.collection('pm_threads').update(t.id, { gm_project: savedProjectId }, { requestKey: null });
            }

            // Backfill gm_project on PM attachments
            const attachments = await pb.collection('pm_card_attachments').getFullList({
                filter: cardFilter,
                requestKey: null,
            });
            for (const a of attachments) {
                await pb.collection('pm_card_attachments').update(a.id, { gm_project: savedProjectId }, { requestKey: null });
            }
        }

        // Migrate research todos card checklists → pm_gm_metadata
        const todosCard = researchCards.find(c => c.research_card_type === 'todos');
        if (todosCard && Array.isArray(todosCard.checklists) && todosCard.checklists.length > 0) {
            await pb.collection('pm_gm_metadata').create({
                gm_project: savedProjectId,
                checklists: todosCard.checklists,
            }, { requestKey: null });
        }

        // Migrate research mindmaps → gm_project so they appear in GI Mind Maps tab
        const mindmapsCard = researchCards.find(c => c.research_card_type === 'mindmaps');
        if (mindmapsCard) {
            try {
                const mindmaps = await pb.collection('pm_mindmaps').getFullList({
                    filter: `card = "${mindmapsCard.id}"`,
                    requestKey: null,
                });
                for (const mm of mindmaps) {
                    await pb.collection('pm_mindmaps').update(mm.id, {
                        card: null,
                        gm_project: savedProjectId,
                    }, { requestKey: null });
                }
            } catch (e) {
                console.error('[PM Import] Failed to migrate mindmaps:', e);
            }
        }

        // Mark PM research list as converted
        await pb.collection('pm_lists').update(listId, {
            converted_to_project: savedProjectId,
        });
    } catch (e) {
        console.error('[PM Import] Post-save linking failed:', e);
    }
}

/* ── Contact Management ── */

export function addContact() {
    const name = (this.newContactName || '').trim();
    const phone = (this.newContactPhone || '').trim();
    if (!name || !phone) return;
    if (!this.modalProject._contacts) this.modalProject._contacts = [];
    this.modalProject._contacts.push({ name, phone });
    this.newContactName = '';
    this.newContactPhone = '';
}

export function removeContact(idx) {
    if (!this.modalProject._contacts) return;
    this.modalProject._contacts.splice(idx, 1);
}

export async function saveContacts() {
    if (!this.modalProject.id) return;
    try {
        var serialized = JSON.stringify(this.modalProject._contacts || []);
        await pb.collection('projects').update(this.modalProject.id, {
            contacts: serialized,
        }, { requestKey: null });
        var proj = this.projects.find(p => p.id === this.modalProject.id);
        if (proj) proj.contacts = serialized;
        this.showNotification('Contacts saved!', 'success');
    } catch (e) {
        console.error('Failed to save contacts:', e);
        this.showNotification('Failed to save contacts', 'error');
    }
}
