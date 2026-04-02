/**
 * Budget, UI & Stats Methods
 * ~820 lines
 */

import { SCORE_TABLES, pb } from '../config.js';
import DOMPurify from 'dompurify';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

/**
 * Sanitize any HTML string with DOMPurify.
 * Use in v-html bindings: v-html="sanitize(content)"
 */
export function sanitize(html) {
    if (!html) return '';
    return DOMPurify.sanitize(html);
}

// ========== LOCALE SWITCHER ==========

export function switchLocale() {
    const next = this.$i18n.locale === 'en' ? 'es' : 'en'
    this.$i18n.locale = next
    localStorage.setItem('gm-locale', next)
    // Re-build budget feed descriptions for new locale
    if (typeof this.fetchBudgetFeed === 'function') this.fetchBudgetFeed()
}

// ========== DUMMY SCORE CALCULATOR ==========

export function getDummyScoreResult() {
    const { U, B, D, N, M } = SCORE_TABLES;
    const calc = this.dummyCalc;
    
    // Get weighted values
    const Uu = U[calc.u] || 0;
    const Bb = B[calc.b] || 0;
    const Dd = D[calc.d] || 0;
    const Nn = N[calc.n] || 1;
    const Mm = M[Math.min(calc.stepNo, 3)] || 1;
    
    // Impact
    const impact = Uu * Bb * Dd;
    
    // Risk
    const riskBase = 1.0;
    const risk = calc.externalDependency ? riskBase * 1.1 : riskBase;
    
    // Emergency
    const E = calc.emergency ? 4.0 : 1.0;
    
    // Denominator
    const baseCost = Math.max(calc.baseCost, 1);
    const denominator = baseCost * risk;
    
    // Final score (multiplied by 100 for readability)
    const rawScore = (impact / denominator) * Mm * Nn * calc.k * E;
    const score = rawScore * 100;
    
    return {
        Uu, Bb, Dd, Nn, Mm,
        impact: impact.toFixed(2),
        risk: risk.toFixed(2),
        E,
        denominator: denominator.toFixed(0),
        score: score.toFixed(1),
        // Formula parts for display
        formulaParts: {
            impactFormula: `${Uu} × ${Bb} × ${Dd}`,
            denominatorFormula: `$${baseCost.toLocaleString()} × ${risk.toFixed(2)}`,
            multiplierFormula: `${Mm} × ${Nn} × ${calc.k} × ${E}`
        }
    };
}

// ========== SCORE POPOVER ==========

export function toggleScorePopover(tierId) {
    if (this.activeScorePopover === tierId) {
        this.activeScorePopover = null;
    } else {
        this.activeScorePopover = tierId;
    }
}

export function closeScorePopover() {
    this.activeScorePopover = null;
}

// ========== BUDGET METHODS ==========

export function openBudgetModal(tier, isInKind) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to edit budgets.", "error");
        return;
    }
    
    this.activeBudgetTier = tier;
    // Set isInKindContext flag on the tier for the modal
    this.activeBudgetTier.isInKindContext = isInKind;
    
    // Initialize tempBudget from tier's breakdown or defaults
    if (tier.breakdown && typeof tier.breakdown === 'object') {
        this.tempBudget = {
            assets: tier.breakdown.assets || 0,
            services: tier.breakdown.services || 0,
            logistics: tier.breakdown.logistics || 0,
            support: tier.breakdown.support || 0
        };
    } else if (tier.breakdown && typeof tier.breakdown === 'string') {
        try {
            const parsed = JSON.parse(tier.breakdown);
            this.tempBudget = {
                assets: parsed.assets || 0,
                services: parsed.services || 0,
                logistics: parsed.logistics || 0,
                support: parsed.support || 0
            };
        } catch (e) {
            this.tempBudget = { assets: tier.cost || 0, services: 0, logistics: 0, support: 0 };
        }
    } else {
        // Default: all cost goes to assets
        this.tempBudget = { assets: tier.cost || 0, services: 0, logistics: 0, support: 0 };
    }
    
    // Initialize tempInKind if it's an in-kind context
    if (isInKind) {
        if (tier.inKindDetails) {
            const inKind = typeof tier.inKindDetails === 'string' ? JSON.parse(tier.inKindDetails) : tier.inKindDetails;
            // Ensure walletId is converted to string to match PocketBase IDs
            const walletId = inKind.walletId ? String(inKind.walletId) : null;
            this.tempInKind = {
                active: true,
                people: inKind.people || 1,
                hours: inKind.hours || 1,
                rate: inKind.rate || 10,
                walletId: walletId
            };
            // Calculate services cost from in-kind
            this.updateInKindServiceCost();
        } else {
            // New in-kind tier - initialize with defaults but set active to true
            this.tempInKind = {
                active: true,
                people: 1,
                hours: 1,
                rate: 10,
                walletId: null
            };
        }
    } else {
        this.tempInKind = {
            active: false,
            people: 1,
            hours: 1,
            rate: 10,
            walletId: null
        };
    }
    
    this.showBudgetModal = true;
}

export function closeBudgetModal() {
    this.showBudgetModal = false;
    this.activeBudgetTier = null;
    this.tempBudget = { assets: 0, services: 0, logistics: 0, support: 0 };
    this.tempInKind = {
        active: false,
        people: 1,
        hours: 1,
        rate: 10,
        walletId: null
    };
}

export function saveBudgetDetails() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to save budget details.", "error");
        return;
    }
    
    if (!this.activeBudgetTier) return;
    
    // Validate wallet selection for in-kind projects
    if (this.activeBudgetTier.isInKindContext) {
        if (!this.tempInKind.walletId) {
            this.showNotification("Please select a wallet for in-kind project expenses.", "error");
            return;
        }
    }
    
    // Calculate total cost (cash costs)
    const cashCosts = (this.tempBudget.assets || 0) + 
                      (this.tempBudget.services || 0) + 
                      (this.tempBudget.logistics || 0) + 
                      (this.tempBudget.support || 0);
    
    // For in-kind projects, add labor value to total
    let total = cashCosts;
    if (this.activeBudgetTier.isInKindContext) {
        const laborValue = (this.tempInKind.people || 0) * (this.tempInKind.hours || 0) * (this.tempInKind.rate || 0);
        total = cashCosts + laborValue;
    }
    
    // Update tier cost
    this.activeBudgetTier.cost = total;
    
    // Save breakdown
    this.activeBudgetTier.breakdown = {
        assets: this.tempBudget.assets || 0,
        services: this.tempBudget.services || 0,
        logistics: this.tempBudget.logistics || 0,
        support: this.tempBudget.support || 0
    };
    
    // Save in-kind details if applicable (always save if it's an in-kind context)
    if (this.activeBudgetTier.isInKindContext) {
        // Ensure walletId is saved as string to match PocketBase format
        const walletId = this.tempInKind.walletId ? String(this.tempInKind.walletId) : null;
        this.activeBudgetTier.inKindDetails = {
            people: this.tempInKind.people || 1,
            hours: this.tempInKind.hours || 1,
            rate: this.tempInKind.rate || 10,
            walletId: walletId
        };
    }
    
    this.closeBudgetModal();
}

export function updateInKindServiceCost() {
    // Labor value is now calculated on-the-fly in the template
    // tempBudget.services is now used for "Paid Services" (separate from labor)
    // This function is kept for @input event but does nothing
}

// ========== UI HELPER METHODS ==========

export function limitWords(field, max) {
    if (field === 'description' && this.modalProject.description) {
        const words = this.modalProject.description.split(/\s+/).filter(w => w);
        if (words.length > max) {
            this.modalProject.description = words.slice(0, max).join(' ');
        }
    }
}

// Helper function to strip HTML tags and get plain text
export function stripHtml(html) {
    if (!html) return '';
    // If it's already plain text (no HTML tags), return as-is
    if (!html.includes('<')) return html;
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Process HTML for safe display (sanitize + ensure links open in new tab)
export function processHtmlForDisplay(html) {
    if (!html) return '';
    if (!html.includes('<')) return html;
    return DOMPurify.sanitize(html);
}

// Get word count from HTML description (strips HTML first)
export function getDescriptionWordCount() {
    const text = this.modalProject.description || '';
    const plainText = this.stripHtml(text);
    return plainText.split(/\s+/).filter(w => w).length;
}

// Initialize Quill editor for description
export function initDescriptionEditor() {
    this.$nextTick(() => {
        const editorElement = document.getElementById('description-editor');
        if (!editorElement) return;
        
        // Destroy existing editor if it exists
        if (this.descriptionEditor) {
            this.descriptionEditor = null;
        }
        
        // Initialize Quill editor
        this.descriptionEditor = new Quill('#description-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        ['bold', 'italic', 'underline'],
                        ['link'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['clean']
                    ],
                    handlers: {
                        'link': function(value) {
                            const quill = this.quill;
                            const range = quill.getSelection();
                            
                            if (value && range) {
                                if (range.length > 0) {
                                    // Text is selected - make it a link
                                    let href = prompt('Enter the URL:');
                                    if (href && href.trim()) {
                                        // Ensure URL has protocol
                                        href = href.trim();
                                        if (!href.startsWith('http://') && !href.startsWith('https://')) {
                                            href = 'https://' + href;
                                        }
                                        quill.formatText(range.index, range.length, 'link', href);
                                    }
                                } else {
                                    // No text selected - prompt for both text and URL
                                    const text = prompt('Enter link text:');
                                    if (text && text.trim()) {
                                        let href = prompt('Enter the URL:');
                                        if (href && href.trim()) {
                                            // Ensure URL has protocol
                                            href = href.trim();
                                            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                                                href = 'https://' + href;
                                            }
                                            quill.insertText(range.index, text.trim(), 'link', href);
                                            quill.setSelection(range.index + text.trim().length);
                                        }
                                    }
                                }
                            } else {
                                // Remove link
                                quill.format('link', false);
                            }
                        }
                    }
                }
            },
            placeholder: 'Description (Max 120 words)'
        });
        
        // Set initial content
        const currentDescription = this.modalProject.description || '';
        this.descriptionEditor.root.innerHTML = currentDescription;
        
        // Helper function to process links in editor
        const processLinks = () => {
            const links = this.descriptionEditor.root.querySelectorAll('a');
            links.forEach(link => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                link.classList.add('text-blue-600', 'underline', 'hover:text-blue-800');
            });
        };
        
        // Update modalProject.description when content changes
        this.descriptionEditor.on('text-change', () => {
            const html = this.descriptionEditor.root.innerHTML;
            const plainText = this.stripHtml(html);
            const wordCount = plainText.split(/\s+/).filter(w => w).length;
            
            // Process links first
            processLinks();
            
            if (wordCount > 120) {
                // Get the current selection to restore cursor position
                const selection = this.descriptionEditor.getSelection();
                const index = selection ? selection.index : 0;
                
                // Limit to 120 words by removing excess
                const words = plainText.split(/\s+/).filter(w => w);
                const limitedWords = words.slice(0, 120);
                const limitedText = limitedWords.join(' ');
                
                // Set limited content (as plain text to avoid HTML complexity)
                this.descriptionEditor.root.innerHTML = limitedText;
                this.modalProject.description = limitedText;
                
                // Restore cursor position (clamped to end)
                const newLength = limitedText.length;
                this.descriptionEditor.setSelection(Math.min(index, newLength));
                
                this.showNotification('Description limited to 120 words', 'info');
            } else {
                this.modalProject.description = html;
            }
        });
        
        // Process existing links immediately
        processLinks();
    });
}

// Initialize Quill editors for scholarship form
export function initScholarshipEditors() {
    this.$nextTick(() => {
        // Initialize description editor
        const descEl = document.getElementById('scholarship-description-editor');
        if (descEl && !this.scholarshipDescriptionEditor) {
            this.scholarshipDescriptionEditor = new Quill('#scholarship-description-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        ['link'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['clean']
                    ]
                },
                placeholder: 'Describe the scholarship...'
            });
            
            // Sync with modalScholarship.description
            this.scholarshipDescriptionEditor.on('text-change', () => {
                this.modalScholarship.description = this.scholarshipDescriptionEditor.root.innerHTML;
            });
        }
        
        // Initialize feedback editor
        const feedbackEl = document.getElementById('scholarship-feedback-editor');
        if (feedbackEl && !this.scholarshipFeedbackEditor) {
            this.scholarshipFeedbackEditor = new Quill('#scholarship-feedback-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['clean']
                    ]
                },
                placeholder: 'Any additional notes...'
            });
            
            // Sync with modalScholarship.feedback
            this.scholarshipFeedbackEditor.on('text-change', () => {
                this.modalScholarship.feedback = this.scholarshipFeedbackEditor.root.innerHTML;
            });
        }
    });
}

// Destroy scholarship editors (call when leaving tab)
export function destroyScholarshipEditors() {
    if (this.scholarshipDescriptionEditor) {
        this.scholarshipDescriptionEditor = null;
    }
    if (this.scholarshipFeedbackEditor) {
        this.scholarshipFeedbackEditor = null;
    }
}

// Initialize Quill editor for project notes
export function initNoteEditor() {
    this.$nextTick(() => {
        const editorElement = document.getElementById('note-editor');
        if (!editorElement) return;
        
        // Destroy existing editor if it exists
        if (this.noteEditorInstance) {
            this.noteEditorInstance = null;
        }
        
        // Initialize Quill editor
        this.noteEditorInstance = new Quill('#note-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    ['link'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['clean']
                ]
            },
            placeholder: 'Write your note here...'
        });
        
        // Set initial content if editing existing note
        if (this.noteEditorContent) {
            this.noteEditorInstance.root.innerHTML = this.noteEditorContent;
        }
    });
}

// Open note editor modal
export function openNoteEditor(type, existingContent = '') {
    this.noteEditorType = type; // 'start' or 'completion'
    this.noteEditorContent = existingContent || '';
    this.showNoteEditorModal = true;
    this.initNoteEditor();
}

// Save note from editor
export function saveNoteFromEditor() {
    if (this.noteEditorInstance) {
        this.noteEditorContent = this.noteEditorInstance.root.innerHTML;
        // Check if content is empty (Quill adds <p><br></p> for empty)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.noteEditorContent;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        if (!textContent.trim()) {
            this.noteEditorContent = '';
        }
    }
    this.showNoteEditorModal = false;
    this.noteEditorInstance = null;
}

// Cancel note editor
export function cancelNoteEditor() {
    this.showNoteEditorModal = false;
    this.noteEditorContent = '';
    this.noteEditorInstance = null;
}

// Open note viewer modal (context = { tier, field: 'startNote'|'completionNote' } when from timeline, enables Edit for admins)
export function openNoteViewer(content, context = null) {
    this.noteViewerContent = content || '';
    this.noteViewerContext = context;
    this.noteViewerEditing = false;
    this.noteViewerEditorInstance = null;
    this.showNoteViewerModal = true;
}

// Close note viewer modal
export function closeNoteViewer() {
    if (this.noteViewerEditorInstance) {
        this.noteViewerEditorInstance = null;
    }
    this.showNoteViewerModal = false;
    this.noteViewerContent = '';
    this.noteViewerContext = null;
    this.noteViewerEditing = false;
}

// Start editing note in viewer (admin only; requires noteViewerContext)
export function startNoteViewerEdit() {
    if (!this.noteViewerContext) return;
    this.noteViewerEditing = true;
    this.$nextTick(() => {
        const el = document.getElementById('note-viewer-editor');
        if (!el) return;
        if (this.noteViewerEditorInstance) {
            this.noteViewerEditorInstance = null;
        }
        this.noteViewerEditorInstance = new Quill('#note-viewer-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    ['link'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['clean']
                ]
            },
            placeholder: 'Write your note here...'
        });
        if (this.noteViewerContent) {
            this.noteViewerEditorInstance.root.innerHTML = this.noteViewerContent;
        }
    });
}

// Save note from viewer (update tier in PocketBase and local timeline data)
export async function saveNoteFromViewer() {
    if (!this.noteViewerContext || !this.noteViewerEditorInstance) return;
    let content = this.noteViewerEditorInstance.root.innerHTML;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    if (!textContent.trim()) content = '';
    const { tier, field } = this.noteViewerContext;
    try {
        await pb.collection('tiers').update(tier.id, { [field]: content });
        this.noteViewerContent = content;
        if (this.projectTimelineData && this.projectTimelineData.tiers) {
            const tierData = this.projectTimelineData.tiers.find(td => td.tier && td.tier.id === tier.id);
            if (tierData && tierData.tier) tierData.tier[field] = content;
        }
        const userName = this.getCurrentUserName();
        const projTitle = this.projectTimelineData?.project?.title || 'project';
        const noteType = field === 'startNote' ? 'start' : 'completion';
        this.logAction(`${userName} saved ${noteType} note for step ${tier.level || '?'} of project '${projTitle}'`);
        this.showNotification('Note saved.', 'success');
    } catch (e) {
        console.error('Error saving note:', e);
        this.showNotification('Error saving note: ' + (e.message || 'Unknown error'), 'error');
        return;
    }
    this.noteViewerEditorInstance = null;
    this.noteViewerEditing = false;
}

// Cancel editing in note viewer
export function cancelNoteViewerEdit() {
    this.noteViewerEditorInstance = null;
    this.noteViewerEditing = false;
}

export function limitTierWords(tier, field, max) {
    if (tier[field]) {
        const words = tier[field].split(/\s+/).filter(w => w);
        if (words.length > max) {
            tier[field] = words.slice(0, max).join(' ');
        }
    }
}

export function getPendingStep(proj) {
    if (!proj || !proj.tiers || proj.tiers.length === 0) return null;
    // Find the first tier that needs verification:
    // - Has allocatedAmount > 0 (funds allocated, waiting verification)
    // - OR has status 'funded' but doesn't have proof
    // Skip completed tiers
    for (let tier of proj.tiers) {
        if (tier.status === 'completed') continue;
        const hasAllocation = (tier.allocatedAmount || 0) > 0;
        const isFunded = tier.status === 'funded' || (tier.funded || 0) > 0;
        const needsVerification = hasAllocation || (isFunded && !this.hasProof(tier));
        if (needsVerification) {
            return tier.level;
        }
    }
    return null;
}

export function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

// ========== LOADING & NOTIFICATION METHODS ==========

export function showLoading(message = 'Processing...') {
    this.loadingMessage = message;
    this.isLoading = true;
}

export function hideLoading() {
    this.isLoading = false;
    this.loadingMessage = 'Processing...';
}

export function showNotification(message, type = 'success', duration = 3000) {
    this.notification = {
        show: true,
        type: type,
        message: message,
        duration: duration
    };
    setTimeout(() => {
        this.notification.show = false;
    }, duration);
}

export function showConfirm(message, onConfirm, onCancel = null) {
    if (!message || !onConfirm) {
        console.error('showConfirm called with invalid parameters:', { message, onConfirm });
        return;
    }
    // Ensure we reset any previous state
    this.confirmDialog = {
        show: true,
        message: String(message), // Ensure it's a string
        onConfirm: onConfirm,
        onCancel: onCancel || (() => { 
            this.confirmDialog.show = false;
            this.confirmDialog.message = '';
            this.confirmDialog.onConfirm = null;
            this.confirmDialog.onCancel = null;
        })
    };
}

export function handleConfirm() {
    if (this.confirmDialog.onConfirm) {
        this.confirmDialog.onConfirm();
    }
    // Reset dialog state
    this.confirmDialog = {
        show: false,
        message: '',
        onConfirm: null,
        onCancel: null
    };
}

export function handleCancel() {
    if (this.confirmDialog.onCancel) {
        this.confirmDialog.onCancel();
    }
    // Reset dialog state
    this.confirmDialog = {
        show: false,
        message: '',
        onConfirm: null,
        onCancel: null
    };
}

// ========== STATS PAGE METHODS ==========

export function getTotalCommunityHours() {
    let total = 0;
    this.projects.forEach(p => {
        if (!p.tiers) return;
        p.tiers.forEach(t => {
            if (t.communityLabor) {
                const labor = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor) : t.communityLabor;
                total += (labor.people || 0) * (labor.hours || 0);
            } else {
                const cp = t.verifiedCommunityPeople ?? t.communityPeople ?? 0;
                const ch = t.verifiedCommunityHours ?? t.communityHours ?? 0;
                total += cp * ch;
            }
        });
    });
    return total;
}

export function getTotalNgoHours() {
    // NGO hours = in-kind volunteer hours (our labor). Use same sources as Dashboard communityStats:
    // completed tiers: verifiedInkind* else inkind*; fallback to laborVerified* / inKindDetails for legacy.
    let total = 0;
    this.projects.forEach(p => {
        if (p.type === 'scholarship' || !p.tiers) return;
        p.tiers.forEach(t => {
            const completed = t.status === 'completed' && this.hasProof(t);
            // Prefer standard tier fields (used everywhere: totalDonated, communityStats, getTierDisplayInkindValue)
            const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0;
            const ih = t.verifiedInkindHours ?? t.inkindHours ?? 0;
            if (ip > 0 || ih > 0) {
                total += ip * ih;
                return;
            }
            // Fallback: legacy labor fields (only when standard fields empty)
            if (t.laborVerifiedPeople || t.laborVerifiedHours) {
                total += (t.laborVerifiedPeople || 0) * (t.laborVerifiedHours || 0);
            } else if (t.inKindDetails) {
                const details = typeof t.inKindDetails === 'string' ? JSON.parse(t.inKindDetails) : t.inKindDetails;
                total += (details.people || 0) * (details.hours || 0);
            }
        });
    });
    return total;
}

export function getTotalCommunityValue() {
    let total = 0;
    this.projects.forEach(p => {
        if (!p.tiers) return;
        p.tiers.forEach(t => {
            if (t.communityLabor) {
                const labor = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor) : t.communityLabor;
                total += (labor.totalValue || 0);
            } else {
                const cp = t.verifiedCommunityPeople ?? t.communityPeople ?? 0;
                const ch = t.verifiedCommunityHours ?? t.communityHours ?? 0;
                const cr = t.verifiedCommunityRate ?? t.communityRate ?? 0;
                total += cp * ch * cr;
            }
        });
    });
    return total;
}

export function getTotalImpactValue() {
    return this.totalDonated + this.getTotalNgoHours() * 3.5 + this.getTotalCommunityValue();
}

export function getCompletionRate() {
    const total = this.projects.length || 1;
    return Math.round((this.completedProjects.length / total) * 100);
}

export function initStatsCharts() {
    this.$nextTick(() => {
        if (this.currentView === 'analytics') {
            setTimeout(() => {
                this.initVelocityChart();
                this.initRadarChart();
                this.initAllocationChart();
                this.initTimelineChart();
                this.initStatsExtraCharts();
                this.initStatsWildCharts();
            }, 500);
        }
    });
}

export function initFinancialCharts() {
    this.initStatsExtraCharts();
    this.initStatsWildCharts();
}

export function initProjectCharts() {
    this.initStatsExtraCharts();
    this.initStatsWildCharts();
    this.initTimelineChart();
}

export function initImpactCharts() {
    this.initStatsExtraCharts();
    this.initStatsWildCharts();
}

export function initAlgorithmCharts() {
    this.initVelocityChart();
    this.initRadarChart();
    this.initAllocationChart();
    this.initStatsExtraCharts();
    this.initStatsWildCharts();
}

export function initActivityCharts() {
    // Activity tab uses HTML-rendered content, no Chart.js needed
}

export function initVelocityChart() {
    const canvas = this.$refs.velocityChart;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const data = this.completedProjects.map(p => {
        const created = new Date(this.getProjectCreatedDate(p));
        const completed = new Date(this.getProjectCompletedDateForSort(p));
        const days = Math.max(1, (completed - created) / (1000 * 60 * 60 * 24));
        const cost = this.getTotalCost(p);
        return { x: days, y: cost, project: p.title };
    });
    
    if (this.velocityChartInstance) this.velocityChartInstance.destroy();
    
    this.velocityChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Projects',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                pointRadius: (ctx) => {
                    const value = ctx.parsed.y;
                    return Math.max(5, Math.min(20, value / 500));
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Days to Complete' }, beginAtZero: true },
                y: { title: { display: true, text: 'Total Cost ($)' }, beginAtZero: true }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.project}: $${this.formatMoney(ctx.raw.y)} in ${ctx.raw.x.toFixed(0)} days`
                    }
                }
            }
        }
    });
}

export function initRadarChart() {
    const canvas = this.$refs.radarChart;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const metrics = this.efficiencyMetrics;
    
    if (this.radarChartInstance) this.radarChartInstance.destroy();
    
    this.radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: metrics.map(m => m.name),
            datasets: [{
                label: 'Efficiency',
                data: metrics.map(m => m.value),
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                borderColor: 'rgba(139, 92, 246, 1)',
                pointBackgroundColor: 'rgba(139, 92, 246, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(139, 92, 246, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { stepSize: 20 }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const metric = metrics[ctx.dataIndex];
                            return `${metric.name}: ${metric.description}`;
                        }
                    }
                }
            }
        }
    });
}

export function initAllocationChart() {
    const canvas = this.$refs.allocationChart;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const stats = this.allocationStats;
    
    if (this.allocationChartInstance) this.allocationChartInstance.destroy();
    
    this.allocationChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Over Budget', 'On Budget', 'Under Budget'],
            datasets: [{
                label: 'Projects',
                data: [stats.overBudget, stats.onBudget, stats.underBudget],
                backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(139, 92, 246, 0.7)'],
                borderColor: ['rgba(239, 68, 68, 1)', 'rgba(16, 185, 129, 1)', 'rgba(139, 92, 246, 1)'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} project${ctx.parsed.y !== 1 ? 's' : ''}`
                    }
                }
            }
        }
    });
}

export function initTimelineChart() {
    const canvas = this.$refs.timelineChart;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const months = {};
    this.completedProjects.forEach(p => {
        const date = new Date(this.getProjectCompletedDateForSort(p));
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!months[monthKey]) months[monthKey] = 0;
        months[monthKey]++;
    });
    
    const sortedMonths = Object.keys(months).sort();
    
    if (this.timelineChartInstance) this.timelineChartInstance.destroy();
    
    this.timelineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMonths.map(m => {
                const [year, month] = m.split('-');
                return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }),
            datasets: [{
                label: 'Projects Completed',
                data: sortedMonths.map(m => months[m]),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} project${ctx.parsed.y !== 1 ? 's' : ''} completed`
                    }
                }
            }
        }
    });
}

// Initialize the 7 extra Stats page charts (cost type donut, monthly flow, tiers dist, category completion, value dist, transaction types, wallet share)
export function initStatsExtraCharts() {
    if (typeof Chart === 'undefined') return;
    const destroy = (inst) => { if (inst) inst.destroy(); };

    // 1. Cost Type Donut
    const costCanvas = this.$refs.costTypeDonutChart;
    if (costCanvas) {
        destroy(this.costTypeDonutInstance);
        const stats = this.expenseStats || [];
        const ctx = costCanvas.getContext('2d');
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
        this.costTypeDonutInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: stats.map(s => s.name),
                datasets: [{
                    data: stats.map(s => s.value),
                    backgroundColor: stats.map((_, i) => colors[i % colors.length]),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: { position: 'right' },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: $${this.formatMoney(ctx.raw)} (${((ctx.raw / ctx.dataset.data.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` } }
                }
            }
        });
    }

    // 2. Monthly Cash Flow (last 12 months)
    const flowCanvas = this.$refs.monthlyFlowChart;
    if (flowCanvas) {
        destroy(this.monthlyFlowChartInstance);
        const months = {};
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), deposits: 0, allocations: 0, reimbursements: 0 };
        }
        this.transactions.forEach(tx => {
            const d = new Date(tx.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!months[key]) return;
            const amt = Math.abs(Number(tx.amount) || 0);
            if (tx.type === 'DEPOSIT' || tx.type === 'DONATION') months[key].deposits += amt;
            else if (tx.type === 'ALLOCATION') months[key].allocations += amt;
            else if (tx.type === 'REIMBURSEMENT') months[key].reimbursements += amt;
        });
        const sorted = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
        const ctx2 = flowCanvas.getContext('2d');
        this.monthlyFlowChartInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: sorted.map(([, v]) => v.label),
                datasets: [
                    { label: 'In (Deposits)', data: sorted.map(([, v]) => v.deposits), backgroundColor: 'rgba(16, 185, 129, 0.8)', borderColor: '#10b981', borderWidth: 1 },
                    { label: 'Out (Allocations)', data: sorted.map(([, v]) => v.allocations), backgroundColor: 'rgba(239, 68, 68, 0.8)', borderColor: '#ef4444', borderWidth: 1 },
                    { label: 'Reimbursements', data: sorted.map(([, v]) => v.reimbursements), backgroundColor: 'rgba(139, 92, 246, 0.8)', borderColor: '#8b5cf6', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: false }, y: { beginAtZero: true, stacked: false } },
                plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: $${this.formatMoney(c.raw)}` } } }
            }
        });
    }

    // 3. Tiers per project distribution
    const tiersCanvas = this.$refs.tiersDistChart;
    if (tiersCanvas) {
        destroy(this.tiersDistChartInstance);
        const counts = { 1: 0, 2: 0, 3: 0 };
        this.projects.filter(p => p.type !== 'scholarship').forEach(p => {
            const n = (p.tiers && p.tiers.length) || 0;
            if (n >= 1 && n <= 3) counts[n]++;
        });
        const ctx3 = tiersCanvas.getContext('2d');
        this.tiersDistChartInstance = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: ['1 step', '2 steps', '3 steps'],
                datasets: [{ label: 'Projects', data: [counts[1], counts[2], counts[3]], backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)'], borderColor: ['#3b82f6', '#10b981', '#f59e0b'], borderWidth: 2 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} project${c.raw !== 1 ? 's' : ''}` } } }
            }
        });
    }

    // 4. Category completion (horizontal bar: completed vs total per category)
    const catCanvas = this.$refs.categoryCompletionChart;
    if (catCanvas && this.categoryPerformance && this.categoryPerformance.length) {
        destroy(this.categoryCompletionChartInstance);
        const perf = this.categoryPerformance;
        const ctx4 = catCanvas.getContext('2d');
        this.categoryCompletionChartInstance = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: perf.map(c => c.name),
                datasets: [
                    { label: 'Completed', data: perf.map(c => Math.round((c.completionRate / 100) * c.projects)), backgroundColor: 'rgba(16, 185, 129, 0.8)', borderColor: '#10b981', borderWidth: 1 },
                    { label: 'Remaining', data: perf.map(c => c.projects - Math.round((c.completionRate / 100) * c.projects)), backgroundColor: 'rgba(203, 213, 225, 0.8)', borderColor: '#94a3b8', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
                plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}` } } }
            }
        });
    }

    // 5. Project value distribution (bins)
    const valueCanvas = this.$refs.valueDistChart;
    if (valueCanvas) {
        destroy(this.valueDistChartInstance);
        const bins = ['0-500', '500-1k', '1k-2.5k', '2.5k-5k', '5k+'];
        const limits = [0, 500, 1000, 2500, 5000, Infinity];
        const counts = [0, 0, 0, 0, 0];
        this.completedProjects.filter(p => p.type !== 'scholarship').forEach(p => {
            const v = this.getTotalCost(p);
            for (let i = 0; i < limits.length - 1; i++) {
                if (v >= limits[i] && v < limits[i + 1]) { counts[i]++; break; }
            }
        });
        const ctx5 = valueCanvas.getContext('2d');
        this.valueDistChartInstance = new Chart(ctx5, {
            type: 'bar',
            data: {
                labels: bins,
                datasets: [{ label: 'Projects', data: counts, backgroundColor: 'rgba(99, 102, 241, 0.7)', borderColor: '#6366f1', borderWidth: 2 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} project${c.raw !== 1 ? 's' : ''}` } } }
            }
        });
    }

    // 6. Transaction types donut
    const txCanvas = this.$refs.transactionTypesDonutChart;
    if (txCanvas) {
        destroy(this.transactionTypesDonutInstance);
        const typeCount = {};
        this.transactions.forEach(tx => {
            const t = tx.type || 'Other';
            typeCount[t] = (typeCount[t] || 0) + 1;
        });
        const txLabels = Object.keys(typeCount).sort();
        const txColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
        const ctx6 = txCanvas.getContext('2d');
        this.transactionTypesDonutInstance = new Chart(ctx6, {
            type: 'doughnut',
            data: {
                labels: txLabels,
                datasets: [{ data: txLabels.map(l => typeCount[l]), backgroundColor: txLabels.map((_, i) => txColors[i % txColors.length]), borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} tx` } } }
            }
        });
    }

    // 7. Wallet balance share donut
    const walletCanvas = this.$refs.walletShareDonutChart;
    if (walletCanvas && this.wallets && this.wallets.length > 0) {
        destroy(this.walletShareDonutInstance);
        const total = this.wallets.reduce((s, w) => s + (w.balance || 0), 0) || 1;
        const labels = this.wallets.map(w => w.name || 'Unnamed');
        const data = this.wallets.map(w => (w.balance || 0));
        const wColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        const ctx7 = walletCanvas.getContext('2d');
        this.walletShareDonutInstance = new Chart(ctx7, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: labels.map((_, i) => wColors[i % wColors.length]), borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => `${c.label}: $${this.formatMoney(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)` } } }
            }
        });
    }
}

// Seven more wild Stats charts: scatter, category money, cumulative completions, top projects, tier status, reimbursement rate, NGO vs community
export function initStatsWildCharts() {
    if (typeof Chart === 'undefined') return;
    const destroy = (inst) => { if (inst) inst.destroy(); };

    // 1. Allocation vs Verified scatter — each point = tier; total value (monetary + in-kind + community); color by category
    const scatterCanvas = this.$refs.allocationVsVerifiedScatterChart;
    if (scatterCanvas) {
        destroy(this.allocationVsVerifiedScatterInstance);
        const points = [];
        this.projects.forEach(p => {
            if (!p.tiers) return;
            const catName = p.categoryName || (Array.isArray(p.categories) && p.categories[0]) || 'Other';
            const color = this.getCategoryColor(catName) || '#6366f1';
            p.tiers.forEach(t => {
                if (t.status !== 'completed' || !this.hasProof(t)) return;
                const allocMon = t.allocatedMonetaryCost ?? t.allocatedAmount ?? 0;
                const inkindVal = (t.inkindPeople || 0) * (t.inkindHours || 0) * (t.inkindRate || 0);
                let communityVal = (t.communityPeople || 0) * (t.communityHours || 0) * (t.communityRate || 0);
                if (t.communityLabor) {
                    const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                    communityVal = cl.totalValue ?? (cl.people || 0) * (cl.hours || 0) * (cl.rate || 0);
                }
                const allocatedTotal = allocMon + inkindVal + communityVal;
                const verifiedTotal = this.getTierTotalValue(t);
                if (allocatedTotal <= 0 && verifiedTotal <= 0) return;
                points.push({
                    x: allocatedTotal,
                    y: verifiedTotal,
                    label: `${p.title || 'Project'} · Step ${t.level || '?'}`,
                    category: catName,
                    _color: color,
                    projectId: p.id
                });
            });
        });
        const pointColors = points.map(pt => pt._color || '#6366f1');
        const vm = this;
        const hexToRgba = (hex, a) => {
            if (!hex || hex.startsWith('rgba')) return hex || 'rgba(99,102,241,0.85)';
            if (hex.startsWith('rgb')) return hex.replace(')', `, ${a})`).replace('rgb', 'rgba');
            const h = hex.replace('#', '');
            const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
            return `rgba(${r},${g},${b},${a})`;
        };
        const ctx = scatterCanvas.getContext('2d');
        this.allocationVsVerifiedScatterInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Tiers',
                    data: points,
                    pointBackgroundColor: pointColors.map(c => hexToRgba(c, 0.85)),
                    pointBorderColor: pointColors,
                    pointRadius: 6,
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick(event, elements, chart) {
                    if (elements.length && chart.data.datasets[0].data[elements[0].index]?.projectId) {
                        vm.openProjectDetailsModal(chart.data.datasets[0].data[elements[0].index].projectId);
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Allocated total ($)' }, beginAtZero: true },
                    y: { title: { display: true, text: 'Verified total ($)' }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const cat = c.raw.category || 'Other';
                                const rest = (c.raw.label || '').replace(' · ', ' - ');
                                return `[${cat}] ${rest} (Allocated: $${this.formatMoney(c.raw.x)} → Verified: $${this.formatMoney(c.raw.y)})`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 1b. Copy: Allocation vs Verified with diagonal line and under/over budget zones
    const zonesCanvas = this.$refs.allocationVsVerifiedZonesChart;
    if (zonesCanvas) {
        destroy(this.allocationVsVerifiedZonesChartInstance);
        const pointsZ = [];
        this.projects.forEach(p => {
            if (!p.tiers) return;
            const catName = p.categoryName || (Array.isArray(p.categories) && p.categories[0]) || 'Other';
            const color = this.getCategoryColor(catName) || '#6366f1';
            p.tiers.forEach(t => {
                if (t.status !== 'completed' || !this.hasProof(t)) return;
                const allocMon = t.allocatedMonetaryCost ?? t.allocatedAmount ?? 0;
                const inkindVal = (t.inkindPeople || 0) * (t.inkindHours || 0) * (t.inkindRate || 0);
                let communityVal = (t.communityPeople || 0) * (t.communityHours || 0) * (t.communityRate || 0);
                if (t.communityLabor) {
                    const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                    communityVal = cl.totalValue ?? (cl.people || 0) * (cl.hours || 0) * (cl.rate || 0);
                }
                const allocatedTotal = allocMon + inkindVal + communityVal;
                const verifiedTotal = this.getTierTotalValue(t);
                if (allocatedTotal <= 0 && verifiedTotal <= 0) return;
                pointsZ.push({
                    x: allocatedTotal,
                    y: verifiedTotal,
                    label: `${p.title || 'Project'} · Step ${t.level || '?'}`,
                    category: catName,
                    _color: color,
                    projectId: p.id
                });
            });
        });
        const maxVal = pointsZ.length ? Math.max(1, ...pointsZ.map(pt => Math.max(pt.x, pt.y))) : 1;
        const vmZ = this;
        const hexToRgbaZ = (hex, a) => {
            if (!hex || hex.startsWith('rgba')) return hex || 'rgba(99,102,241,0.85)';
            if (hex.startsWith('rgb')) return hex.replace(')', `, ${a})`).replace('rgb', 'rgba');
            const h = hex.replace('#', '');
            const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
            return `rgba(${r},${g},${b},${a})`;
        };
        const zonePlugin = {
            id: 'zonesAndDiagonal',
            beforeDatasetsDraw(chart) {
                const options = chart.options?.plugins?.zonesAndDiagonal || {};
                const ctx = chart.ctx;
                const area = chart.chartArea;
                if (!area) return;
                const x = chart.scales.x ?? Object.values(chart.scales).find(s => s.axis === 'x');
                const y = chart.scales.y ?? Object.values(chart.scales).find(s => s.axis === 'y');
                if (!x || !y) return;
                const left = x.getPixelForValue(0);
                const right = x.getPixelForValue(maxVal);
                const bottom = y.getPixelForValue(0);
                const top = y.getPixelForValue(maxVal);
                ctx.save();
                ctx.beginPath();
                ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
                ctx.clip();
                ctx.beginPath();
                ctx.moveTo(left, bottom);
                ctx.lineTo(right, top);
                ctx.lineTo(right, bottom);
                ctx.closePath();
                ctx.fillStyle = options.underBudgetFill || 'rgba(34, 197, 94, 0.08)';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(left, bottom);
                ctx.lineTo(right, top);
                ctx.lineTo(left, top);
                ctx.closePath();
                ctx.fillStyle = options.overBudgetFill || 'rgba(239, 68, 68, 0.08)';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(left, bottom);
                ctx.lineTo(right, top);
                ctx.strokeStyle = options.diagonalColor || 'rgba(148, 163, 184, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
        };
        this.allocationVsVerifiedZonesChartInstance = new Chart(zonesCanvas.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'Under budget', data: [], backgroundColor: 'rgba(34, 197, 94, 0.25)', borderColor: 'rgba(34, 197, 94, 0.4)', pointRadius: 0, order: 2 },
                    { label: 'Over budget', data: [], backgroundColor: 'rgba(239, 68, 68, 0.25)', borderColor: 'rgba(239, 68, 68, 0.4)', pointRadius: 0, order: 2 },
                    {
                        label: 'Tiers',
                        data: pointsZ,
                        pointBackgroundColor: pointsZ.map(pt => hexToRgbaZ(pt._color, 0.85)),
                        pointBorderColor: pointsZ.map(pt => pt._color),
                        pointRadius: 6,
                        pointBorderWidth: 2,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick(event, elements, chart) {
                    if (elements.length) {
                        const dsIdx = elements[0].datasetIndex;
                        const ptIdx = elements[0].index;
                        const raw = chart.data.datasets[dsIdx]?.data?.[ptIdx];
                        if (raw?.projectId) vmZ.openProjectDetailsModal(raw.projectId);
                    }
                },
                scales: {
                    x: { min: 0, max: maxVal, title: { display: true, text: 'Allocated total ($)' }, beginAtZero: true },
                    y: { min: 0, max: maxVal, title: { display: true, text: 'Verified total ($)' }, beginAtZero: true }
                },
                plugins: {
                    zonesAndDiagonal: { underBudgetFill: 'rgba(34, 197, 94, 0.08)', overBudgetFill: 'rgba(239, 68, 68, 0.08)', diagonalColor: 'rgba(148, 163, 184, 0.5)' },
                    legend: {
                        display: true,
                        labels: {
                            generateLabels(chart) {
                                const ds = chart.data.datasets;
                                return [0, 1].filter(i => ds[i]).map(i => ({
                                    text: ds[i].label,
                                    fillStyle: ds[i].backgroundColor,
                                    strokeStyle: ds[i].borderColor,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                if (!c.raw.label) return null;
                                const cat = c.raw.category || 'Other';
                                const rest = c.raw.label.replace(' · ', ' - ');
                                return `[${cat}] ${rest} (Allocated: $${this.formatMoney(c.raw.x)} → Verified: $${this.formatMoney(c.raw.y)})`;
                            }
                        }
                    }
                }
            },
            plugins: [zonePlugin]
        });
    }

    // 2. On-budget completion by category — horizontal bar 0–100%: share of completed value within 10% of allocated
    const onBudgetCanvas = this.$refs.onBudgetByCategoryChart;
    if (onBudgetCanvas) {
        destroy(this.onBudgetByCategoryChartInstance);
        const categories = this.categoryRecords?.length ? this.categoryRecords.map(c => c.name) : (this.categories || []).filter(c => c !== 'Scholarship');
        const getProjectCat = (p) => p.categoryName || (Array.isArray(p.categories) && p.categories[0]) || null;
        const getAllocatedTotal = (t) => {
            const allocMon = t.allocatedMonetaryCost ?? t.allocatedAmount ?? 0;
            const inkindVal = (t.inkindPeople || 0) * (t.inkindHours || 0) * (t.inkindRate || 0);
            let communityVal = (t.communityPeople || 0) * (t.communityHours || 0) * (t.communityRate || 0);
            if (t.communityLabor) {
                const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                communityVal = cl.totalValue ?? (cl.people || 0) * (cl.hours || 0) * (cl.rate || 0);
            }
            return allocMon + inkindVal + communityVal;
        };
        const perCategory = categories.map(catName => {
            let totalValue = 0, onBudgetValue = 0;
            this.projects.forEach(p => {
                if (getProjectCat(p) !== catName || !p.tiers) return;
                p.tiers.forEach(t => {
                    if (t.status !== 'completed' || !this.hasProof(t)) return;
                    const allocatedTotal = getAllocatedTotal(t);
                    const verifiedTotal = this.getTierTotalValue(t);
                    if (verifiedTotal <= 0) return;
                    totalValue += verifiedTotal;
                    const pctDiff = allocatedTotal > 0 ? Math.abs(verifiedTotal - allocatedTotal) / allocatedTotal : 0;
                    if (pctDiff <= 0.10) onBudgetValue += verifiedTotal;
                });
            });
            const pct = totalValue > 0 ? (onBudgetValue / totalValue) * 100 : 0;
            return { name: catName, pct: Math.round(pct * 10) / 10, totalValue, onBudgetValue };
        }).filter(r => r.totalValue > 0);
        const ctxOnBudget = onBudgetCanvas.getContext('2d');
        this.onBudgetByCategoryChartInstance = new Chart(ctxOnBudget, {
            type: 'bar',
            data: {
                labels: perCategory.map(r => r.name),
                datasets: [{
                    label: '% value within 10% of budget',
                    data: perCategory.map(r => r.pct),
                    backgroundColor: perCategory.map(r => this.getCategoryColor(r.name) || '#6366f1'),
                    borderColor: perCategory.map(r => this.getCategoryColor(r.name) || '#6366f1'),
                    borderWidth: 2,
                    barThickness: 14
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { min: 0, max: 100, ticks: { stepSize: 20 }, title: { display: true, text: '% of completed value within 10% of budget' } },
                    y: { ticks: { font: { size: 12 } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const r = perCategory[c.dataIndex];
                                return `${r.pct}% — $${this.formatMoney(r.onBudgetValue)} of $${this.formatMoney(r.totalValue)} on budget`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 3. Where money went (by category) — doughnut of completed value per category
    const moneyCatCanvas = this.$refs.moneyByCategoryDonutChart;
    if (moneyCatCanvas && this.chartCategoryStats && this.chartCategoryStats.length) {
        destroy(this.moneyByCategoryDonutInstance);
        const stats = this.chartCategoryStats.filter(s => s.value > 0);
        const ctx2 = moneyCatCanvas.getContext('2d');
        this.moneyByCategoryDonutInstance = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: stats.map(s => s.name),
                datasets: [{
                    data: stats.map(s => s.value),
                    backgroundColor: stats.map((s, i) => this.getCategoryColor(s.name) || ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 5]),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                                return `$${this.formatMoney(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 3. Cumulative completions over time — line chart, running total of completed projects by month
    const cumCanvas = this.$refs.cumulativeCompletionsLineChart;
    if (cumCanvas) {
        destroy(this.cumulativeCompletionsLineInstance);
        const byMonth = {};
        this.completedProjects.forEach(p => {
            const d = new Date(this.getProjectCompletedDateForSort(p));
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
        let running = 0;
        const cumulative = sorted.map(([k, v]) => {
            running += v;
            return { x: k, y: running, label: new Date(k + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) };
        });
        const ctx3 = cumCanvas.getContext('2d');
        this.cumulativeCompletionsLineInstance = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: cumulative.map(d => d.label),
                datasets: [{
                    label: 'Cumulative completions',
                    data: cumulative.map(d => d.y),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} total completed` } } }
            }
        });
    }

    // 4. Top projects by value — horizontal bar, top 8 completed (non-scholarship)
    const topCanvas = this.$refs.topProjectsByValueBarChart;
    if (topCanvas) {
        destroy(this.topProjectsByValueBarInstance);
        const list = this.completedProjects
            .filter(p => p.type !== 'scholarship')
            .map(p => ({ title: (p.title || 'Untitled').slice(0, 28), value: this.getTotalCost(p) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
        const ctx4 = topCanvas.getContext('2d');
        this.topProjectsByValueBarInstance = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: list.map(p => p.title + (p.title.length >= 28 ? '…' : '')),
                datasets: [{ label: 'Value ($)', data: list.map(p => p.value), backgroundColor: 'rgba(245, 158, 11, 0.8)', borderColor: '#f59e0b', borderWidth: 1 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `$${this.formatMoney(c.raw)}` } } }
            }
        });
    }

    // 5. Tier status pie — backlog / in_progress / completed
    const tierPieCanvas = this.$refs.tierStatusPieChart;
    if (tierPieCanvas) {
        destroy(this.tierStatusPieInstance);
        let backlog = 0, inProgress = 0, completed = 0;
        this.projects.forEach(p => {
            if (!p.tiers || p.type === 'scholarship') return;
            p.tiers.forEach(t => {
                if (t.status === 'completed' && this.hasProof(t)) completed++;
                else if (t.status === 'in_progress') inProgress++;
                else backlog++;
            });
        });
        const ctx5 = tierPieCanvas.getContext('2d');
        this.tierStatusPieInstance = new Chart(ctx5, {
            type: 'pie',
            data: {
                labels: ['Backlog', 'In progress', 'Completed'],
                datasets: [{
                    data: [backlog, inProgress, completed],
                    backgroundColor: ['#94a3b8', '#f59e0b', '#10b981'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} tier${c.raw !== 1 ? 's' : ''}` } } }
            }
        });
    }

    // 6. Reimbursement rate — bar: total allocated vs total reimbursed (with optional target)
    const reimbCanvas = this.$refs.reimbursementRateBarChart;
    if (reimbCanvas) {
        destroy(this.reimbursementRateBarInstance);
        const totalAlloc = this.getTotalAllocations();
        const totalReimb = this.getTotalReimbursements();
        const ctx6 = reimbCanvas.getContext('2d');
        this.reimbursementRateBarInstance = new Chart(ctx6, {
            type: 'bar',
            data: {
                labels: ['Allocated (out)', 'Reimbursed (back)'],
                datasets: [{
                    label: 'Amount ($)',
                    data: [totalAlloc, totalReimb],
                    backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(16, 185, 129, 0.8)'],
                    borderColor: ['#ef4444', '#10b981'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const pct = totalAlloc > 0 && c.dataIndex === 1 ? ` (${((totalReimb / totalAlloc) * 100).toFixed(1)}% of allocated)` : '';
                                return `$${this.formatMoney(c.raw)}${pct}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 7. NGO vs Community hours — polar area; use same source as Dashboard (communityStats = completed tiers only)
    const ngoCanvas = this.$refs.ngoVsCommunityHoursChart;
    if (ngoCanvas) {
        destroy(this.ngoVsCommunityHoursInstance);
        const stats = this.communityStats || {};
        const ngoH = stats.ngoHours ?? 0;
        const commH = stats.commHours ?? 0;
        const ctx7 = ngoCanvas.getContext('2d');
        this.ngoVsCommunityHoursInstance = new Chart(ctx7, {
            type: 'polarArea',
            data: {
                labels: ['NGO volunteer hours', 'Community hours'],
                datasets: [{
                    data: [Math.max(0.1, ngoH), Math.max(0.1, commH)],
                    backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(249, 115, 22, 0.7)'],
                    borderColor: ['#3b82f6', '#f97316'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { r: { beginAtZero: true } },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw.toFixed(0)} h` } }
                }
            }
        });
    }
}

export function getTotalDeposits() {
    return this.transactions
        .filter(t => t.type === 'DEPOSIT')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

export function getTotalAllocations() {
    return this.transactions
        .filter(t => t.type === 'ALLOCATION')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

export function getTotalReimbursements() {
    return this.transactions
        .filter(t => t.type === 'REIMBURSEMENT')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

export function getTotalAdditional() {
    return this.transactions
        .filter(t => t.type === 'ADDITIONAL')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

export function getMonthlyActivity() {
    const months = {};
    this.transactions.forEach(tx => {
        const date = new Date(tx.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!months[monthKey]) {
            months[monthKey] = {
                key: monthKey,
                label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                count: 0
            };
        }
        months[monthKey].count++;
    });
    return Object.values(months).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
}

export function getActivityColor(count) {
    if (count > 20) return '#ef4444';
    if (count > 10) return '#f59e0b';
    if (count > 5) return '#3b82f6';
    return '#10b981';
}

// Money Flow Diagram Methods
export function getTotalDonations() {
    return this.transactions
        .filter(t => t.type === 'DONATION')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

export function getBacklogValue() {
    return this.baseBacklogList.reduce((sum, proj) => {
        if (!proj.tiers) return sum;
        return sum + proj.tiers.reduce((tierSum, t) => {
            const remaining = (t.cost || 0) - (t.funded || 0);
            return tierSum + Math.max(0, remaining);
        }, 0);
    }, 0);
}

export function getInProgressCount() {
    // Count tiers with allocatedAmount > 0 (waiting for verification)
    let count = 0;
    this.projects.forEach(proj => {
        if (!proj.tiers) return;
        proj.tiers.forEach(t => {
            if ((t.allocatedAmount || 0) > 0) count++;
        });
    });
    return count;
}

export function getPendingVerificationValue() {
    // Sum of all allocated amounts currently frozen (in_progress tiers)
    let total = 0;
    this.projects.forEach(proj => {
        if (!proj.tiers) return;
        proj.tiers.forEach(t => {
            // Check both field names for compatibility
            // allocatedMonetaryCost is used by Start Project flow
            // allocatedAmount is used by old algorithmic flow
            if (t.status === 'in_progress') {
                total += (t.allocatedMonetaryCost || t.allocatedAmount || 0);
            }
        });
    });
    return total;
}

export function getPendingVerificationProjectCount() {
    // Count of projects that have at least one tier in_progress
    let count = 0;
    this.projects.forEach(proj => {
        if (!proj.tiers) return;
        if (proj.tiers.some(t => t.status === 'in_progress')) {
            count++;
        }
    });
    return count;
}

export function getCompletedValue() {
    // Sum of all funded amounts in completed projects
    return this.completedProjects.reduce((sum, proj) => {
        if (!proj.tiers) return sum;
        return sum + proj.tiers.reduce((tierSum, t) => {
            return tierSum + (t.funded || t.cost || 0);
        }, 0);
    }, 0);
}

export function getTiersByStatus(status) {
    let count = 0;
    this.projects.forEach(proj => {
        if (!proj.tiers) return;
        proj.tiers.forEach(t => {
            // For 'pending' status, also check that allocatedAmount is 0
            if (status === 'pending') {
                if ((t.status === 'pending' || !t.status) && (t.allocatedAmount || 0) === 0) {
                    count++;
                }
            } else if (t.status === status) {
                count++;
            }
        });
    });
    return count;
}

export function getAllocatedTiersCount() {
    // Count tiers with allocatedAmount > 0
    let count = 0;
    this.projects.forEach(proj => {
        if (!proj.tiers) return;
        proj.tiers.forEach(t => {
            if ((t.allocatedAmount || 0) > 0) count++;
        });
    });
    return count;
}
