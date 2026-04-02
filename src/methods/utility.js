/**
 * Utility & Helper Methods
 * ~480 lines
 */

import { pb, collectionIdCache } from '../config.js'
import { initForest } from '../pixel-forest.js'

/** Trigger hero number count-up animations using reactive data */
export function animateHeroNumbers() {
  const vm = this
  const projects = vm.completedProjects?.length || 0
  const donated = vm.totalDonated || 0
  const hours = Math.round((vm.communityStats?.ngoHours || 0) + (vm.communityStats?.commHours || 0))

  vm.heroAnimProjects = 0
  vm.heroAnimDonated = 0
  vm.heroAnimHours = 0
  vm.heroNumbersReady = true

  const start = performance.now()
  const step = (now) => {
    const p1 = Math.min((now - start) / 2000, 1)
    const p2 = Math.min((now - start) / 2500, 1)
    const e1 = 1 - Math.pow(1 - p1, 3)
    const e2 = 1 - Math.pow(1 - p2, 3)
    vm.heroAnimProjects = Math.round(e1 * projects)
    vm.heroAnimDonated = Math.round(e2 * donated).toLocaleString('en-US')
    vm.heroAnimHours = Math.round(e1 * hours)
    if (p1 < 1 || p2 < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/**
 * Check if the current user has a specific permission.
 * Admins always return true. Staff users are checked against userPermissions JSON.
 */
export function hasPerm(key) {
    if (this.isAdmin) return true;
    return this.userPermissions?.[key] === true;
}

/**
 * Get the current user's display name for logbook and UI.
 * Tries: name, username, email (PocketBase users may have name optional; email is always present for auth).
 */
export function getCurrentUserName() {
    const m = pb.authStore.model;
    if (!m) return 'User';
    const name = m.name != null && String(m.name).trim() ? String(m.name).trim() : '';
    const username = m.username != null && String(m.username).trim() ? String(m.username).trim() : '';
    const email = m.email != null && String(m.email).trim() ? String(m.email).trim() : '';
    return name || username || email || 'User';
}

/**
 * Log an action to the logbook. Caller must pass a full sentence including user name and descriptive context.
 * Does not throw; logbook write failures are silently ignored so they never break the main action.
 * @param {string} description - Full action text, e.g. "John Doe created project 'Community Garden'"
 */
export function logAction(description) {
    if (!description || typeof description !== 'string') return;
    try {
        const userId = pb.authStore.model?.id;
        pb.collection('logbook').create({
            action: description.trim(),
            user: userId || null
        });
    } catch (e) {
        console.warn('Logbook write failed:', e);
    }
}

// Calculate days between two dates (for timeline display)
export function getDaysBetween(date1, date2) {
    if (!date1 || !date2) return null;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Compute the date range across all tiers/events for the Gantt chart
export function getTimelineRange() {
    const data = this.projectTimelineData;
    if (!data || !data.tiers || data.tiers.length === 0) return { minMs: 0, maxMs: 0, totalMs: 1 };
    let min = Infinity, max = -Infinity;
    for (const td of data.tiers) {
        for (const ev of td.events) {
            if (!ev.date) continue;
            const ms = new Date(ev.date).getTime();
            if (isNaN(ms)) continue;
            if (ms < min) min = ms;
            if (ms > max) max = ms;
        }
    }
    // If max is in the past, extend to today so in_progress tiers show a trailing bar
    const now = Date.now();
    if (max < now) max = now;
    // Ensure some range even if all dates are the same
    const totalMs = max - min || 1;
    return { minMs: min, maxMs: max, totalMs };
}

// Get percentage position (0-100) of a date within the timeline range
export function getEventPct(dateStr) {
    if (!dateStr) return 0;
    const range = this.getTimelineRange();
    const ms = new Date(dateStr).getTime();
    if (isNaN(ms)) return 0;
    return ((ms - range.minMs) / range.totalMs) * 100;
}

// Generate one tick per day for the Gantt date axis
export function getGanttTicks() {
    const range = this.getTimelineRange();
    if (range.totalMs <= 1) return [];
    const ticks = [];
    // Start at midnight of the first day
    const startDate = new Date(range.minMs);
    startDate.setHours(0, 0, 0, 0);
    const endMs = range.maxMs;
    const d = new Date(startDate);
    while (d.getTime() <= endMs + 86400000) { // include one day past end
        const ms = d.getTime();
        const pct = ((ms - range.minMs) / range.totalMs) * 100;
        if (pct >= -2 && pct <= 102) { // slight margin
            ticks.push({
                pct: Math.max(0, Math.min(100, pct)),
                label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                year: d.getFullYear()
            });
        }
        d.setDate(d.getDate() + 1);
    }
    return ticks;
}

// Open the Gantt popover for a specific event marker (teleported to body, fixed positioning)
export function openGanttPopover(event, tierIdx, evtIdx, $event) {
    this.ganttPopoverEvent = {
        event,
        tierIdx,
        evtIdx,
        x: $event.clientX,
        y: $event.clientY - 12
    };
}

// Format days between for display
export function formatDaysBetween(date1, date2) {
    const days = this.getDaysBetween(date1, date2);
    if (days === null) return '';
    if (days === 0) return 'Same day';
    if (days === 1) return '1 day';
    return `${days} days`;
}

const EXPENSE_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#06b6d4', '#ec4899', '#84cc16'];
export function getExpenseColor(name, index) {
    if (name === 'Unknown') return '#94a3b8';
    if (typeof index === 'number') return EXPENSE_PALETTE[index % EXPENSE_PALETTE.length];
    return EXPENSE_PALETTE[0];
}

/**
 * Returns the localized display name for a category.
 * Falls back to the original (English) name if no translation is available.
 */
export function getCatName(name) {
    if (!name) return '';
    if (this.$i18n?.locale === 'es') {
        const rec = this.categoryRecords?.find(r => r.name === name);
        if (rec?.name_es) return rec.name_es;
    }
    return name;
}

/**
 * Returns the localized display name for a cost type.
 * Falls back to the original (English) name if no translation is available.
 */
export function getCostTypeName(name) {
    if (!name) return '';
    if (this.$i18n?.locale === 'es') {
        const rec = this.costTypes?.find(r => r.name === name);
        if (rec?.name_es) return rec.name_es;
    }
    return name;
}

export function getCategoryColor(categoryName) {
    const rec = this.categoryRecords?.find(r => r.name === categoryName);
    if (rec?.color && /^#([0-9a-fA-F]{3}){1,2}$/.test(rec.color)) return rec.color;
    const colorMap = {
        'Infrastructure': '#6a89cc',
        'Education': '#f6b93b',
        'Agriculture': '#78e08f',
        'Health': '#e55039',
        'Community': '#a55eea',
        'Scholarship': '#f1c40f'
    };
    return colorMap[categoryName] || '#95a5a6';
}

export function getCategoryCount(cat, view) {
    let list = view === 'backlog' ? this.baseBacklogList : this.completedProjects;
    
    // Apply sort/filter option for backlog view (e.g., "In Progress" filter)
    if (view === 'backlog' && this.sortOrderBacklog === 'inprogress') {
        list = list.filter(p => p.tiers?.some(t => t.status === 'in_progress'));
    }
    
    if (cat === 'All') return list.length;
    
    // Special handling for "Scholarship" category - count projects with type === 'scholarship'
    if (cat === 'Scholarship') {
        return list.filter(p => p.type === 'scholarship').length;
    }
    
    // For regular categories, filter by categories array (exclude scholarships)
    return list.filter(p => {
        if (p.type === 'scholarship') return false; // Scholarships only show under "Scholarship" category
        let projectCategories = p.categories;
        if (typeof projectCategories === 'string') {
            try {
                projectCategories = JSON.parse(projectCategories);
            } catch (e) {
                projectCategories = [];
            }
        }
        return Array.isArray(projectCategories) && projectCategories.includes(cat);
    }).length;
}

export function getBreakdown(tier) {
    // For completed tiers: show verifiedBreakdown (accumulated verified costs)
    // For pending tiers: show breakdown (original planned costs)
    const sourceBreakdown = tier.status === 'completed' && tier.verifiedBreakdown 
        ? tier.verifiedBreakdown 
        : tier.breakdown;
    
    if (sourceBreakdown) {
        // Handle both object and string formats
        const breakdown = typeof sourceBreakdown === 'string' 
            ? JSON.parse(sourceBreakdown) 
            : sourceBreakdown;
        return {
            assets: breakdown.assets || breakdown.materials || 0,
            services: breakdown.services || breakdown.labor || 0,
            logistics: breakdown.logistics || 0,
            support: breakdown.support || breakdown.other || 0
        };
    }
    // Default: all cost goes to assets (use funded for completed, cost for pending)
    const defaultAmount = tier.status === 'completed' ? (tier.funded || tier.cost || 0) : (tier.cost || 0);
    return { 
        assets: defaultAmount, 
        services: 0, 
        logistics: 0, 
        support: 0 
    };
}

export function getOriginalBreakdown(tier) {
    // Get the original breakdown (cash costs only)
    // For in-kind tiers: breakdown contains only cash costs, NOT labor value
    // For regular tiers: breakdown should match tier.cost
    const currentBreakdown = this.getBreakdown(tier);
    const currentTotal = (currentBreakdown.assets || 0) + 
                       (currentBreakdown.services || 0) + 
                       (currentBreakdown.logistics || 0) + 
                       (currentBreakdown.support || 0);
    
    // For in-kind tiers, return breakdown as-is (it represents cash costs only)
    // tier.cost includes labor value, so don't scale against it
    if (tier.inKindDetails) {
        return currentBreakdown;
    }
    
    const originalCost = tier.cost || 0;
    
    // If current breakdown total matches original cost, return it as-is
    if (Math.abs(currentTotal - originalCost) < 0.01) {
        return currentBreakdown;
    }
    
    // If current breakdown total is different, scale proportionally to original cost
    // (This handles legacy data where breakdown might not sum to tier.cost)
    if (currentTotal > 0 && originalCost > 0) {
        const scale = originalCost / currentTotal;
        return {
            assets: Math.round((currentBreakdown.assets || 0) * scale * 100) / 100,
            services: Math.round((currentBreakdown.services || 0) * scale * 100) / 100,
            logistics: Math.round((currentBreakdown.logistics || 0) * scale * 100) / 100,
            support: Math.round((currentBreakdown.support || 0) * scale * 100) / 100
        };
    }
    
    // Fallback: all cost goes to assets
    return { 
        assets: originalCost, 
        services: 0, 
        logistics: 0, 
        support: 0 
    };
}

export function getPlannedCostsOnly(tier) {
    // For in-kind tiers: return just the monetary costs portion (all 4 cost types)
    // Labor value is tracked separately in inKindDetails
    const breakdown = this.getOriginalBreakdown(tier);
    return (breakdown.assets || 0) + (breakdown.services || 0) + (breakdown.logistics || 0) + (breakdown.support || 0);
}

export function getRemainingBreakdown(tier) {
    // Calculate remaining breakdown (what's left to allocate)
    const originalBreakdown = this.getOriginalBreakdown(tier);
    // Use costsFunded for monetary tracking (funded may include labor value)
    const monetaryFunded = tier.costsFunded !== undefined ? tier.costsFunded : (tier.funded || 0);
    const originalCost = tier.cost || 0;
    const remainingTotal = originalCost - monetaryFunded;
    
    // If nothing is funded, return original breakdown
    if (monetaryFunded <= 0 || remainingTotal <= 0) {
        return originalBreakdown;
    }
    
    // Calculate proportion of remaining vs original
    const proportion = remainingTotal / originalCost;
    
    // Scale each category proportionally
    return {
        assets: Math.round((originalBreakdown.assets || 0) * proportion * 100) / 100,
        services: Math.round((originalBreakdown.services || 0) * proportion * 100) / 100,
        logistics: Math.round((originalBreakdown.logistics || 0) * proportion * 100) / 100,
        support: Math.round((originalBreakdown.support || 0) * proportion * 100) / 100
    };
}

export function hasProof(tier) {
    if (!tier.proof) return false;
    if (Array.isArray(tier.proof)) return tier.proof.length > 0;
    if (typeof tier.proof === 'string') return tier.proof.length > 0;
    return !!tier.proof;
}

export function getProofUrls(tier) {
    const out = [];
    if (!tier.proof || !tier.id) return out;
    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_PB_URL || ''));
    const collId = tier.collectionId || collectionIdCache.tiers || 'tiers';
    const files = Array.isArray(tier.proof) ? tier.proof : (typeof tier.proof === 'string' ? [tier.proof] : []);
    files.forEach((file, idx) => {
        let name = '';
        let url = '';
        if (typeof file === 'string') {
            name = file;
            url = `${baseUrl}/api/files/${collId}/${tier.id}/${file}`;
        } else if (file && typeof file === 'object') {
            name = file.name || file.filename || `proof_${idx + 1}`;
            if (file.url) url = file.url.startsWith('http') ? file.url : `${baseUrl}${file.url.startsWith('/') ? '' : '/'}${file.url}`;
            else url = `${baseUrl}/api/files/${collId}/${tier.id}/${name}`;
        }
        if (url) out.push({ url, filename: name || `proof_${idx + 1}` });
    });
    return out;
}

export function getProofUrl(tier) {
    const urls = this.getProofUrls(tier);
    return urls.length > 0 ? urls[0].url : '#';
}

export function openProofViewer(tier) {
    const proofUrl = this.getProofUrl(tier);
    if (!proofUrl || proofUrl === '#') {
        this.showNotification("Proof document not available.", "error");
        return;
    }
    
    // Determine file type from URL
    const urlLower = proofUrl.toLowerCase();
    const isPdf = urlLower.endsWith('.pdf') || urlLower.includes('.pdf');
    const isImage = urlLower.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
    
    this.proofViewerUrl = proofUrl;
    this.proofViewerType = isPdf ? 'pdf' : (isImage ? 'image' : 'pdf'); // Default to PDF if uncertain
    this.showProofViewerModal = true;
}

// NEW: Check if project has any started tiers (for enabling transaction history icon)
export function hasStartedTiers(proj) {
    if (!proj || !proj.tiers) return false;
    return proj.tiers.some(t => t.status === 'in_progress' || t.status === 'completed');
}

// NEW: Open project timeline modal (replaces old project transaction history)
export async function openProjectTransactionHistory(proj) {
    // Check if any tiers have been started
    if (!this.hasStartedTiers(proj)) {
        return; // Don't open if no tiers started
    }
    
    // Show modal immediately with loading state
    this.projectTimelineData = {
        project: proj,
        tiers: [],
        loading: true
    };
    this.showProjectTimelineModal = true;
    
    try {
        // Fetch all transactions for this project
        const projectTransactions = await pb.collection('transactions').getFullList({
            filter: `project = "${proj.id}"`,
            sort: 'date' // Oldest first for timeline
        });
        
        // Fetch fresh tier data from PocketBase to get latest fields (startNote, completionNote)
        const freshTiers = await pb.collection('tiers').getFullList({
            filter: `project = "${proj.id}"`,
            sort: 'level'
        });
        
        // Build timeline data for each tier
        const tiersData = [];
        
        for (const tier of proj.tiers) {
            // Get fresh tier data with notes
            const freshTier = freshTiers.find(t => t.id === tier.id) || tier;
            const tierWithNotes = { ...tier, ...freshTier };
            const tierEvents = [];
            const tierTxs = projectTransactions.filter(tx => tx.tier === tier.id);
            
            // Get wallet info for transactions
            const getWalletName = (walletId) => {
                const w = this.wallets.find(w => w.id === walletId);
                return w ? w.name : 'Unknown';
            };
            
            // Event 1: Added to Backlog (use project created date for tier 1, or tier's own created if available)
            tierEvents.push({
                type: 'backlog',
                label: 'Added to Backlog',
                date: tier.created || proj.created,
                icon: 'fa-plus-circle',
                color: 'gray',
                details: {
                    monetaryCosts: this.getTierMonetaryTotal(tier),
                    inkind: {
                        people: tier.inkindPeople || 0,
                        hours: tier.inkindHours || 0,
                        rate: tier.inkindRate || 0,
                        value: (tier.inkindPeople || 0) * (tier.inkindHours || 0) * (tier.inkindRate || 0)
                    },
                    community: {
                        people: tier.communityPeople || 0,
                        hours: tier.communityHours || 0,
                        rate: tier.communityRate || 0,
                        value: (tier.communityPeople || 0) * (tier.communityHours || 0) * (tier.communityRate || 0)
                    }
                }
            });
            
            // Event 2: Started (ALLOCATION transaction)
            const allocationTx = tierTxs.find(tx => tx.type === 'ALLOCATION');
            if (allocationTx || tier.status === 'in_progress' || tier.status === 'completed') {
                tierEvents.push({
                    type: 'started',
                    label: 'Step Started',
                    date: tier.startedAt || (allocationTx ? allocationTx.date : null),
                    icon: 'fa-play-circle',
                    color: 'orange',
                    details: {
                        walletName: allocationTx ? getWalletName(allocationTx.wallet) : null,
                        allocatedAmount: tier.allocatedMonetaryCost || (allocationTx ? Math.abs(allocationTx.amount) : 0),
                        inkind: {
                            people: tier.inkindPeople || 0,
                            hours: tier.inkindHours || 0,
                            rate: tier.inkindRate || 0,
                            value: (tier.inkindPeople || 0) * (tier.inkindHours || 0) * (tier.inkindRate || 0)
                        },
                        community: {
                            people: tier.communityPeople || 0,
                            hours: tier.communityHours || 0,
                            rate: tier.communityRate || 0,
                            value: (tier.communityPeople || 0) * (tier.communityHours || 0) * (tier.communityRate || 0)
                        }
                    }
                });
            }
            
            // Event 3: Completed (verification)
            if (tier.status === 'completed') {
                const reimbursementTx = tierTxs.find(tx => tx.type === 'REIMBURSEMENT');
                const additionalTx = tierTxs.find(tx => tx.type === 'ADDITIONAL');
                
                // Calculate labor hour differences (verified vs planned)
                const plannedInkindHours = (tier.inkindPeople || 0) * (tier.inkindHours || 0);
                const verifiedInkindHours = (tier.verifiedInkindPeople || 0) * (tier.verifiedInkindHours || 0);
                const inkindHoursDiff = verifiedInkindHours - plannedInkindHours;
                
                const plannedCommunityHours = (tier.communityPeople || 0) * (tier.communityHours || 0);
                const verifiedCommunityHours = (tier.verifiedCommunityPeople || 0) * (tier.verifiedCommunityHours || 0);
                const communityHoursDiff = verifiedCommunityHours - plannedCommunityHours;
                
                tierEvents.push({
                    type: 'completed',
                    label: 'Step Completed',
                    date: tier.completedAt,
                    icon: 'fa-check-circle',
                    color: 'green',
                    tier: tier, // Include tier reference for proof access
                    details: {
                        verifiedAmount: this.getTierDisplayMonetary(tier),
                        reimbursement: reimbursementTx ? Math.abs(reimbursementTx.amount) : 0,
                        additionalCost: additionalTx ? Math.abs(additionalTx.amount) : 0,
                        hasProof: this.hasProof(tier),
                        inkind: {
                            people: tier.verifiedInkindPeople || 0,
                            hours: tier.verifiedInkindHours || 0,
                            rate: tier.verifiedInkindRate || 0,
                            value: (tier.verifiedInkindPeople || 0) * (tier.verifiedInkindHours || 0) * (tier.verifiedInkindRate || 0)
                        },
                        community: {
                            people: tier.verifiedCommunityPeople || 0,
                            hours: tier.verifiedCommunityHours || 0,
                            rate: tier.verifiedCommunityRate || 0,
                            value: (tier.verifiedCommunityPeople || 0) * (tier.verifiedCommunityHours || 0) * (tier.verifiedCommunityRate || 0)
                        },
                        // Labor hour differences (positive = extra, negative = fewer)
                        inkindHoursDiff: inkindHoursDiff,
                        communityHoursDiff: communityHoursDiff
                    }
                });
            }
            
            tiersData.push({
                tier: tierWithNotes,
                level: tierWithNotes.level,
                events: tierEvents
            });
        }
        
        // Fetch step photo counts so Gallery button can be disabled when no photos
        try {
            const projectPhotos = await pb.collection('photos').getFullList({
                filter: `project = "${proj.id}"`
            });
            tiersData.forEach(td => {
                td._stepStartPhotoCount = projectPhotos.filter(p => p.tier === td.tier.id && p.context === 'step_start').length;
                td._stepCompletePhotoCount = projectPhotos.filter(p => p.tier === td.tier.id && p.context === 'step_complete').length;
            });
        } catch (e) {
            console.warn('Could not fetch step photo counts for timeline:', e);
        }
        
        // Fetch PM interventions for completed tiers (query by gm_tier directly)
        try {
            const tierIds = proj.tiers.map(t => t.id);
            const tierFilter = tierIds.map(id => `gm_tier = "${id}"`).join(' || ');
            const allInterventions = await pb.collection('pm_interventions').getFullList({
                filter: tierFilter,
                expand: 'created_by',
                sort: 'date,created',
                $autoCancel: false,
            }).catch(() => []);
            
            if (allInterventions.length > 0) {
                const interventionsByTier = {};
                allInterventions.forEach(intv => {
                    const tierId = intv.gm_tier;
                    if (!tierId) return;
                    if (!interventionsByTier[tierId]) interventionsByTier[tierId] = [];
                    const user = intv.expand?.created_by;
                    const plainText = (intv.description || '').replace(/<[^>]*>/g, '').trim();
                    const excerpt = plainText.length > 100 ? plainText.substring(0, 100) + '…' : plainText;
                    interventionsByTier[tierId].push({
                        type: 'intervention',
                        label: 'Intervention',
                        date: intv.date || intv.created,
                        icon: 'fa-clipboard-check',
                        color: 'indigo',
                        details: {
                            id: intv.id,
                            description: intv.description || '',
                            excerpt: excerpt,
                            userName: user?.name || user?.username || user?.email || 'Unknown',
                            userAvatar: user?.avatar ? pb.files.getUrl(user, user.avatar, { thumb: '200x200' }) : null,
                        }
                    });
                });
                
                tiersData.forEach(td => {
                    const tierInterventions = interventionsByTier[td.tier.id];
                    if (tierInterventions && tierInterventions.length > 0) {
                        td.events.push(...tierInterventions);
                    }
                });
            }
        } catch (e) {
            console.warn('Could not fetch PM interventions for timeline:', e);
        }
        
        this.projectTimelineData.tiers = tiersData;
        this.projectTimelineData.loading = false;
    } catch (error) {
        console.error('Error fetching project timeline:', error);
        this.projectTimelineData.error = 'Failed to load timeline';
        this.projectTimelineData.loading = false;
    }
}

export async function openTierHistory(tier, proj) {
    // Show modal immediately with loading state
    this.tierHistoryData = {
        projName: proj.title,
        tier: tier,
        transactions: null, // null = loading
        loading: true
    };
    this.showTierHistoryModal = true;
    
    try {
        // Fetch fresh tier data from PocketBase to get latest fields (startNote, completionNote)
        const freshTier = await pb.collection('tiers').getOne(tier.id);
        // Merge fresh data with existing tier object (preserve any computed/local properties)
        const updatedTier = { ...tier, ...freshTier };
        this.tierHistoryData.tier = updatedTier;
        
        // Fetch transactions on-demand from PocketBase (keeps app light)
        const tierTransactions = await pb.collection('transactions').getFullList({
            filter: `tier = "${tier.id}"`,
            sort: '-date'
        });
        
        // Separate transactions by type
        const grants = [];
        const allocations = [];
        const adjustments = []; // REIMBURSEMENT and ADDITIONAL
        
        tierTransactions.forEach(tx => {
            // Get wallet name
            const wallet = this.wallets.find(w => w.id === tx.wallet || w.id === tx.walletId);
            
            // Parse details if available
            let breakdown = null;
            let isCompleted = false;
            let volunteerLabor = null;
            if (tx.details) {
                try {
                    const details = typeof tx.details === 'string' ? JSON.parse(tx.details) : tx.details;
                    if (Array.isArray(details) && details.length > 0) {
                        breakdown = details[0].breakdown || details[0].verifiedBreakdown || null;
                        isCompleted = details[0].isCompleted || false;
                        // NEW: Extract volunteer labor info for cash grants
                        volunteerLabor = details[0].volunteerLabor || null;
                    }
                } catch (e) {}
            }
            
            // Get proof URL for GRANT/IN_KIND transactions
            let proofUrl = null;
            if (tx.type === 'GRANT' || tx.type === 'IN_KIND') {
                const proofUrls = this.getProofUrls(tier);
                if (proofUrls.length > 0) {
                    proofUrl = proofUrls[0].url;
                }
            }
            
            const mapped = {
                id: tx.id,
                type: tx.type,
                amount: Math.abs(tx.amount || 0),
                date: tx.date,
                description: tx.description,
                walletName: wallet ? wallet.name : null,
                breakdown: breakdown,
                proofUrl: proofUrl,
                isCompleted: isCompleted,
                adjustment: null, // Will be populated for GRANT transactions
                volunteerLabor: volunteerLabor // NEW: For cash grants with NGO labor
            };
            
            if (tx.type === 'GRANT' || tx.type === 'IN_KIND') {
                grants.push(mapped);
            } else if (tx.type === 'ALLOCATION') {
                allocations.push(mapped);
            } else if (tx.type === 'REIMBURSEMENT' || tx.type === 'ADDITIONAL') {
                adjustments.push(mapped);
            } else {
                allocations.push(mapped); // Fallback for other types
            }
        });
        
        // Pair adjustments with their corresponding GRANT transactions (by closest date)
        adjustments.forEach(adj => {
            const adjDate = new Date(adj.date).getTime();
            let closestGrant = null;
            let closestDiff = Infinity;
            
            grants.forEach(grant => {
                const grantDate = new Date(grant.date).getTime();
                const diff = Math.abs(grantDate - adjDate);
                // Only pair if within 5 minutes (same verification event)
                if (diff < 300000 && diff < closestDiff) {
                    closestDiff = diff;
                    closestGrant = grant;
                }
            });
            
            if (closestGrant) {
                closestGrant.adjustment = {
                    type: adj.type,
                    amount: adj.amount
                };
            }
        });
        
        // Combine and sort (grants + allocations, but NOT standalone adjustments)
        const mappedTransactions = [...grants, ...allocations].sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        // Update modal with loaded data (use updatedTier which has fresh data from PocketBase)
        this.tierHistoryData = {
            projName: proj.title,
            tier: updatedTier,
            transactions: mappedTransactions,
            loading: false
        };
    } catch (error) {
        console.error('Error loading tier transactions:', error);
        this.tierHistoryData = {
            projName: proj.title,
            tier: tier,
            transactions: [],
            loading: false,
            error: 'Failed to load transactions'
        };
    }
}

export function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return 'N/A';
    }
}

export function handleImageError(event) {
    this.showNotification("Failed to load image. The file may be corrupted or the URL is invalid.", "error");
    this.showProofViewerModal = false;
}

export function goTo(view) {
    this.currentView = view;
    document.documentElement.scrollTop = 0;
    if (view === 'home') this.$nextTick(() => initForest());
    if (view === 'donors') this.fetchDonorLaborLogs();
}

export function getIcon(view) {
    const map = {
        home: 'fa-home',
        stats: 'fa-chart-pie',
        analytics: 'fa-chart-line',
        projects: 'fa-folder-open',
        wallets: 'fa-wallet',
        donors: 'fa-hand-holding-heart'
    };
    return map[view] || 'fa-circle';
}

export function getNavStyle(view) {
    if (this.currentView === view) {
        return { backgroundColor: this.settings.theme.headerHover };
    }
    if (this.hoveredNav === view) {
        return { backgroundColor: this.settings.theme.headerHover };
    }
    return {};
}

export function getTransactionIcon(tx) {
    const allocColor = this.settings?.theme?.colorAllocation || '#7c3aed';
    const t = (k) => this.$t ? this.$t('wallets.tx_' + k) : k;
    if (tx._isBudgetEvent) {
        if (tx.event_type === 'allocation') {
            return { icon: 'fa-lock', colorClass: '', bgClass: '', colorStyle: { color: allocColor }, bgStyle: { backgroundColor: this.colorAlpha(allocColor, 0.12), color: allocColor }, label: t('allocation') };
        }
        if (tx.event_type === 'project_completion') {
            return { icon: 'fa-check-circle', colorClass: 'text-blue-600', bgClass: 'bg-blue-100', label: t('project_completion') };
        }
        return { icon: 'fa-info-circle', colorClass: 'text-gray-600', bgClass: 'bg-gray-100', label: t('budget') };
    }
    if (tx.isInternalTransfer) {
        return { icon: 'fa-arrow-right-arrow-left', colorClass: 'text-slate-500', bgClass: 'bg-slate-100', label: t('transfer') };
    }
    if (tx.isTransfer) {
        return { icon: 'fa-arrow-right-arrow-left', colorClass: 'text-slate-500', bgClass: 'bg-slate-100', label: t('transfer') };
    }
    if (tx.description && tx.description.includes('Transfer')) {
        return { icon: 'fa-exchange-alt', colorClass: 'text-gray-600', bgClass: 'bg-gray-100', label: t('transfer') };
    }
    if (tx.type === 'DEPOSIT') {
        return { icon: 'fa-arrow-down', colorClass: 'text-green-600', bgClass: 'bg-green-100', label: t('deposit') };
    }
    if (tx.isDonation) {
        return { icon: 'fa-hand-holding-heart', colorClass: 'text-green-600', bgClass: 'bg-green-100', label: t('donation') };
    }
    if (tx.type === 'income') {
        return { icon: 'fa-arrow-down', colorClass: 'text-green-600', bgClass: 'bg-green-100', label: t('income') };
    }
    if (tx.type === 'DONATION') {
        return { icon: 'fa-heart', colorClass: 'text-purple-600', bgClass: 'bg-purple-100', label: t('donation') };
    }
    if (tx.type === 'GRANT') {
        return { icon: 'fa-hand-holding-dollar', colorClass: 'text-yellow-600', bgClass: 'bg-yellow-100', label: t('grant') };
    }
    if (tx.type === 'ALLOCATION') {
        return { icon: 'fa-lock', colorClass: '', bgClass: '', colorStyle: { color: allocColor }, bgStyle: { backgroundColor: this.colorAlpha(allocColor, 0.12), color: allocColor }, label: t('allocation') };
    }
    if (tx.type === 'REIMBURSEMENT') {
        return { icon: 'fa-undo', colorClass: 'text-green-600', bgClass: 'bg-green-100', label: t('reimbursement') };
    }
    if (tx.type === 'ADDITIONAL') {
        return { icon: 'fa-plus-circle', colorClass: 'text-red-600', bgClass: 'bg-red-100', label: t('additional') };
    }
    if (tx.type === 'WITHDRAW') {
        if (tx.description && tx.description.includes('Scholarship Fixed Costs')) {
            return { icon: 'fa-graduation-cap', colorClass: 'text-yellow-600', bgClass: 'bg-yellow-100', label: t('scholarship') };
        }
        if (tx.description && tx.description.includes('In-Kind Exec')) {
            return { icon: 'fa-hammer', colorClass: 'text-yellow-600', bgClass: 'bg-yellow-100', label: t('inkind') };
        }
        return { icon: 'fa-arrow-up', colorClass: 'text-red-600', bgClass: 'bg-red-100', label: t('withdraw') };
    }
    return { icon: 'fa-circle', colorClass: 'text-gray-600', bgClass: 'bg-gray-100', label: t('unknown') };
}

// Alias for template compatibility
export function getTransactionUi(tx) {
    return this.getTransactionIcon(tx);
}

/** Budget feed table: return inline style for amount cell so color is never overridden. */
export function getBudgetFeedAmountStyle(tx) {
    if (tx._isBudgetEvent && (tx.event_type === 'allocation' || tx.event_type === 'project_completion')) return {};
    if (tx.isInternalTransfer) return { color: '#64748b' }; // slate-500 neutral
    if (tx.isDonation) return { color: '#16a34a' };
    if (tx.type === 'DONATION') return { color: '#16a34a' };
    if (!tx._isBudgetEvent && (tx.type === 'expense' || tx.type === 'WITHDRAW' || tx.type === 'ADDITIONAL')) return { color: '#dc2626' };
    return {};
}

export function getTransactionSource(tx) {
    if (tx._isBudgetEvent) return '—';
    if (tx.description && tx.description.includes('Transfer')) {
        if (tx.type === 'WITHDRAW' && tx.description.includes('Transfer to')) {
            // Extract destination wallet name from "Transfer to [name]"
            const match = tx.description.match(/Transfer to (.+)/);
            if (match) {
                const sourceWallet = this.getWalletName(tx.walletId || tx.wallet);
                return `From ${sourceWallet} to ${match[1]}`;
            }
        } else if (tx.type === 'DEPOSIT' && tx.description.includes('Transfer from')) {
            // Extract source wallet name from "Transfer from [name]"
            const match = tx.description.match(/Transfer from (.+)/);
            if (match) {
                const destWallet = this.getWalletName(tx.walletId || tx.wallet);
                return `From ${match[1]} to ${destWallet}`;
            }
        }
    }
    
    // Regular transaction source logic
    const walletId = tx.walletId || tx.wallet;
    if (walletId) return this.getWalletName(walletId);
    if (tx.sources && tx.sources.length > 0) {
        if (tx.sources.length === 1) return tx.sources[0].name;
        return 'Multi-Source';
    }
    return 'Unknown';
}

export function updateChartLine() {
    // Chart line update logic (same as original)
    if (this.$refs.chartLine) {
        const data = this.financialChartData.data;
        let points = '';
        data.forEach((d, i) => {
            const x = (i / (data.length - 1 || 1)) * 100;
            const y = 100 - (d.cumulative / this.financialChartData.maxChart * 85);
            points += `${points ? ' ' : ''}${x},${y}`;
        });
        this.$refs.chartLine.setAttribute('points', points);
    }
}

export function formatChartDate(dateStr) {
    if (this.chartTimeframe === 'month') {
        const [year, month] = dateStr.split('-');
        return `${month}/${year.slice(2)}`;
    }
    return dateStr;
}

export function navClass(v) {
    return this.currentView === v ? 'font-bold' : '';
}

export function formatMoney(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Convert a hex color to rgba with given alpha.
 * Usage: colorAlpha('#16a34a', 0.1) → 'rgba(22, 163, 74, 0.1)'
 */
export function colorAlpha(hex, alpha) {
    if (!hex) return 'transparent';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function tierColor(l) {
    return l === 1 ? 'text-red-600' : l === 2 ? 'text-orange-600' : 'text-blue-600';
}

export function tierBg(l) {
    return l === 1 ? 'bg-red-50' : l === 2 ? 'bg-orange-50' : 'bg-blue-50';
}

export function tierBadgeColor(l) {
    return l === 1 ? 'bg-red-500' : l === 2 ? 'bg-orange-500' : 'bg-blue-500';
}
