/**
 * Vue App Data - Reactive State
 * ~280 lines
 */

import { DEFAULT_THEME, URGENCY_DEFS, BREADTH_DEFS, DEPTH_DEFS, NEGLECTEDNESS_DEFS, CONFIDENCE_DEFS } from './config.js'

/**
 * Load theme from localStorage or return default
 */
function loadThemeFromStorage() {
    try {
        const savedTheme = localStorage.getItem('ngo_app_theme');
        if (savedTheme) {
            const parsed = JSON.parse(savedTheme);
            if (parsed && typeof parsed === 'object') {
                console.log('Loaded theme from localStorage:', parsed);
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Could not load theme from localStorage:', e);
    }
    // Default theme fallback (will be replaced when settings load from database)
    return DEFAULT_THEME;
}

export function data() {
    return {
        // Authentication
        isAuthenticated: false,
        isGuestMode: false,
        heroNumbersReady: false,
        heroAnimProjects: 0,
        heroAnimDonated: 0,
        heroAnimHours: 0,
        homeSectionHover: null,
        homeSection1Open: false,
        homeSection2Open: false,
        homeSection3Open: false,
        homeSection4Open: false,
        homeSectionHover: null,
        currentUser: null,
        userPermissions: {},
        showLoginModal: false,
        loginUsername: '',
        loginPassword: '',
        loginError: '',
        // 2FA
        requires2FA: false,
        twoFactorCode: '',
        show2FASetupModal: false,
        twoFactorSecret: null,
        twoFactorQRCode: null,
        twoFactorBackupCodes: [],
        twoFactorVerificationCode: '',
        tempAuthData: null,

        pendingTransfers: [],
        donors: [],
        donorExpanded: null,
        donorActiveTab: 'community',
        donorTableSort: 'amount_desc', // 'name' | 'amount_desc' | 'amount_asc'
        donorLaborLogs: [],
        donorLaborLogsLoading: false,
        donorLaborLogsFetched: false,
        showAddDonorModal: false,
        showEditDonorModal: false,
        editingDonor: null,
        newDonorName: '',
        newDonorContact: '',
        newDonorNotes: '',
        newDonationDonorId: '',
        newDonationDescription: '',
        newDonationType: 'cash',
        newDonationValue: 0,
        currentView: 'home',
        whatWeDoOpen: false,
        whatWeDoTab: 'overview',
        dashboardTab: 'glance',
        projectsTab: 'completed', // 'completed' or 'backlog'
        projectViewMode: 'cards', // 'cards' or 'table'
        grantViewMode: 'new', // 'new', 'manual', 'inkind', 'queue', 'logbook', 'transfers'
        userRole: 'guest',
        chartTimeframe: 'month',
        hoveredNav: null,
        mobileMenuOpen: false,
        apiBase: '', // set in mounted for dev hint
        isDev: typeof import.meta !== 'undefined' && !!import.meta.env?.DEV,
        hoveredItemId: null,
        
        
        showModal: false,
        showTransModal: false,
        showGrantModal: false,
        showGalleryModal: false,
        showEditGrantModal: false,
        showScholarshipModal: false,
        activeScorePopover: null, // ID of tier with open score popover
        
        // Design Playground expand states
        playgroundExpandA: false,
        playgroundExpandB: false,
        playgroundExpandC: false,
        playgroundExpandD: false,
        
        showProofViewerModal: false,
        proofViewerUrl: null,
        proofViewerType: null, // 'image' or 'pdf'
        
        // Project Notes
        showNoteEditorModal: false,
        noteEditorContent: '',
        noteEditorType: '', // 'start' or 'completion'
        showNoteViewerModal: false,
        noteViewerContent: '',
        noteViewerContext: null, // { tier, field: 'startNote'|'completionNote' } when opened from timeline (enables Edit)
        noteViewerEditing: false,
        noteViewerEditorInstance: null, // Quill instance when editing in viewer
        noteEditorInstance: null, // Quill editor instance for note editor
        
        // Score Explanation Modal
        showScoreExplanationModal: false,
        scoreExplanationView: 'explanation', // 'explanation' or 'weights'
        
        // Dummy Score Calculator
        dummyCalc: {
            u: 5,
            b: 3,
            d: 3,
            n: 3,
            k: 0.9,
            baseCost: 1000,
            stepNo: 1,
            emergency: false,
            externalDependency: false
        },
        
        // Tier Transaction History Modal (legacy - kept for compatibility)
        showTierHistoryModal: false,
        tierHistoryData: null, // { projName, tier, transactions }
        
        // NEW: Project Timeline Modal
        showProjectTimelineModal: false,
        projectTimelineData: null, // { project, tiers: [{ tier, events: [...] }] }
        expandedTimelineBudgets: [], // Array of tier IDs that have their budget breakdown expanded
        expandedTimelineInterventions: [], // Array of intervention IDs whose full description is shown
        timelineViewMode: 'columns', // 'columns' or 'gantt'
        ganttPopoverEvent: null, // { event, tierIdx, evtIdx, x, y } for the detail popover
        
        // NEW: Start Project Modal
        showStartProjectModal: false,
        startProjectData: null, // { project, tier, selectedWallet }
        
        // NEW: Complete Project Modal
        showCompleteProjectModal: false,
        completeProjectData: null, // { project, tier, verified costs/hours, proof }
        
        // FM Import Modal (preview table before applying to verified costs)
        showFmImportModal: false,
        fmImportLoading: false,
        fmImportError: null,
        fmImportTable: [], // { costTypeName, budget, verified, difference }
        fmImportSummary: '',
        fmImportVerified: null, // { [costTypeId]: number } to apply on confirm
        fmImportLabor: null, // { inkindTotalHours, communityTotalHours, inkindCount, communityCount } or null
        fmImportLaborLogs: [], // individual FM labor log entries [{ date, type, people, hours, user }]
        
        // ⚠️ DEPRECATED: Tier FM Transactions Modal — replaced by Step Management & Research Modal below.
        showTierTransactionsModal: false,
        tierTransactionsModalTier: null,
        tierTransactionsModalProjectName: '',
        tierTransactionsModalList: [],
        tierTransactionsModalSummaryTable: [], // { costTypeName, budget, verified, difference } same as FM Import
        tierTransactionsModalCostTypeToCategory: {}, // costTypeId -> { icon, color, name } from fm_wallet_categories (so Budget table has icons even with 0 transactions)
        tierTransactionsModalBudgetCollapsed: true, // Budget section closed by default
        tierTransactionsModalCategoryFilter: '', // category id or '' for all
        tierTransactionsModalLoading: false,
        tierTransactionsModalError: null,

        // Step Management & Research Modal (read-only mirror of PM step card modal)
        showStepManagementModal: false,
        stepMgmtTier: null,               // raw tier record
        stepMgmtProjectName: '',
        stepMgmtActiveTab: 'overview',     // 'overview' | 'gallery' | 'todos' | 'finance' | 'discussion' | 'attachments' | 'interventions'
        stepMgmtLoading: false,
        stepMgmtError: null,
        // Overview tab data (planned from tier fields)
        stepMgmtMonetary: 0,
        stepMgmtInkind: 0,
        stepMgmtCommunity: 0,
        // Overview tab data (actuals from FM)
        stepMgmtActualMonetary: 0,
        stepMgmtActualInkind: 0,
        stepMgmtActualCommunity: 0,
        stepMgmtScore: null,
        // Finance tab data
        stepMgmtTransactions: [],          // mapped transaction objects
        stepMgmtBudgetRows: [],            // { costTypeName, costTypeId, icon, color, budget, verified, difference }
        stepMgmtLabor: null,               // { inkind: { planned, logged }, community: { planned, logged }, colorInkind, colorCommunity }
        stepMgmtLaborLogs: [],             // individual FM labor log entries [{ date, type, people, hours, user }]
        stepMgmtTierValue: 0,              // total step value (monetary + inkind + community)
        stepMgmtBudgetCollapsed: true,
        stepMgmtAllTxExpanded: false,
        stepMgmtExpandedBudget: [],
        stepMgmtExpandedLabor: [],
        stepMgmtCategoryFilter: '',
        // Todos tab data
        stepMgmtChecklists: [],            // checklist array from pm_cards
        stepMgmtTodoTotal: 0,
        stepMgmtTodoDone: 0,
        // Transaction count for tab badge
        stepMgmtTxCount: 0,
        // Discussion tab data (read-only threaded comments from PM)
        stepMgmtPmCardId: null,            // PM card ID for fetching thread comments
        stepMgmtThreads: [],               // { id, title, userName, userAvatar, lastReplyAt, created, replyCount, lastReplyPreview, lastReplyUser }
        stepMgmtSelectedThread: null,      // Currently selected thread object
        stepMgmtThreadComments: [],        // Comments for the selected thread
        stepMgmtThreadCommentsLoading: false,
        stepMgmtComments: [],              // (kept for backward compat) flat comments
        stepMgmtCommentCount: 0,
        stepMgmtDiscussionSearch: '',      // Search query for discussion messages
        stepMgmtDiscussionUserFilter: '',  // Filter by user ID
        stepMgmtDiscussionShowFilters: false, // Show/hide filter controls
        // Gallery tab data (photos from PocketBase `photos` collection)
        stepMgmtPhotos: [],                // { id, filename, url, thumbUrl, collectionId, context }
        stepMgmtPhotoCount: 0,
        stepMgmtPhotoViewerIndex: null,    // lightbox: current index or null
        // Attachments tab data (from PocketBase `pm_card_attachments` collection)
        stepMgmtAttachments: [],           // { id, file, name, url, isImage, collectionId, created }
        stepMgmtAttachmentCount: 0,
        // Interventions tab data (read-only from PM)
        stepMgmtInterventions: [],         // { id, date, description, userName, userAvatar, created }
        stepMgmtInterventionCount: 0,
        // Donations tab
        stepMgmtDonations: [],
        stepMgmtDonationCount: 0,
        stepMgmtDonationTotal: 0,
        // Sales tab
        stepMgmtSalesTransactions: [],
        stepMgmtSalesNotes: '',
        stepMgmtSalesTotal: 0,
        stepMgmtSalesCount: 0,

        // Project Info Modal (read-only mirror of PM General Info card)
        showProjectInfoModal: false,
        projInfoProject: null,
        projInfoLoading: false,
        projInfoError: null,
        projInfoActiveTab: 'overview',
        projInfoCoverUrl: '',
        projInfoDescription: '',
        projInfoCoordinates: null,
        projInfoMapCollapsed: true,
        projInfoCostMonetary: 0,
        projInfoCostInkind: 0,
        projInfoCostCommunity: 0,
        projInfoPlannedMonetary: 0,
        projInfoPlannedInkind: 0,
        projInfoPlannedCommunity: 0,
        projInfoActualMonetary: 0,
        projInfoActualInkind: 0,
        projInfoActualCommunity: 0,
        projInfoColorMonetary: '#16a34a',
        projInfoColorInkind: '#2563eb',
        projInfoColorCommunity: '#ea580c',
        projInfoGiCardId: null,
        // Gallery
        projInfoProjectPhotos: [],
        projInfoStepPhotos: [],            // [{ tierId, tierLevel, intervention, photos: [...] }]
        projInfoPhotoViewerIndex: null,
        projInfoPhotoViewerList: [],       // flat photo list for lightbox
        // Todos
        projInfoChecklists: [],
        projInfoTodoTotal: 0,
        projInfoTodoDone: 0,
        // Discussion
        projInfoThreads: [],
        projInfoSelectedThread: null,
        projInfoThreadComments: [],
        projInfoThreadCommentsLoading: false,
        projInfoCommentCount: 0,
        // Attachments
        projInfoProjectAttachments: [],
        projInfoStepAttachments: [],       // [{ tierId, tierLevel, intervention, attachments: [...] }]
        projInfoAttachmentCount: 0,
        
        showBudgetModal: false,
        activeBudgetTier: null,
        tempBudget: { assets: 0, services: 0, logistics: 0, support: 0 },
        tempInKind: {
            active: false,
            people: 1,
            hours: 1,
            rate: 10,
            walletId: null
        },
        
        // Loading and Notification System
        isLoading: false,
        loadingMessage: 'Processing...',
        uploadProgress: 0, // 0-100 for upload progress
        notification: {
            show: false,
            type: 'success', // 'success', 'error', 'info'
            message: '',
            duration: 3000
        },
        confirmDialog: {
            show: false,
            message: '',
            onConfirm: null,
            onCancel: null
        },
        
        demoLeaderboard: [
            { name: "Maria Rodríguez", projects: 12, hours: 48, value: 240 },
            { name: "José González", projects: 10, hours: 40, value: 200 },
            { name: "Ana Martínez", projects: 9, hours: 36, value: 180 },
            { name: "Carlos Pérez", projects: 8, hours: 32, value: 160 },
            { name: "Laura Sánchez", projects: 7, hours: 28, value: 140 },
            { name: "Miguel Torres", projects: 6, hours: 24, value: 120 },
            { name: "Isabel Ramírez", projects: 5, hours: 20, value: 100 },
            { name: "Juan Díaz", projects: 5, hours: 20, value: 100 },
            { name: "Sofía Hernández", projects: 4, hours: 16, value: 80 },
            { name: "Luis Flores", projects: 3, hours: 12, value: 60 },
            { name: "Elena Castillo", projects: 2, hours: 8, value: 40 },
            { name: "Pedro Vásquez", projects: 1, hours: 4, value: 20 }
        ],
        activeBreakdownTier: null,

        activeWallet: null,
        
        // Wallet Modal
        showWalletModal: false,
        walletModalMode: 'add', // 'add' or 'edit'
        walletModalData: { name: '', id: null },
        walletModalSaving: false,
        
        activeProjectGallery: null,
        galleryIndex: 0,
        galleryUploadFiles: [], // Files to upload
        galleryMainPhotoIndex: 0, // Index of main photo
        showGalleryManagementModal: false, // Gallery management modal (inside project modal)
        galleryPhotos: [], // Lazy-loaded photos for gallery viewer
        galleryPhotoCount: 0, // Total count of photos (for pagination)
        galleryLoadingPhoto: false, // Loading indicator for individual photo
        editingGrant: null,
        
        transType: 'deposit',
        transAmount: null,
        transDesc: '',
        depositType: 'standard', // 'standard' or 'donation'
        donationVisibility: 'anonymous', // 'anonymous' or 'public'
        donorName: '', // Name of donor (if public donation)
        withdrawType: 'standard', // 'standard' or 'switch'
        destinationWallet: null, // Destination wallet ID for transfers
        transReceiptFile: null, // Receipt file for deposit/donation (required for reporting)
        
        activeGrantDetails: [],
        activeGrantSources: [],
        activeGrantDate: '',
        activeGrantTotal: 0,

        filterCategory: 'All',
        newCategory: '',
        searchQuery: '',
        
        sortOrderBacklog: 'score',
        sortOrderCompleted: 'newest',

        projectsLoading: true,
        projects: [],
        wallets: [],
        transactions: [],
        fmGmWallets: [],
        budgetFeed: [],
        categories: [],
        categoryRecords: [],
        costTypes: [],

        // Lazy-load flags — true once data has been fetched at least once
        _walletsLoaded: false,
        _transactionsLoaded: false,
        _budgetFeedLoaded: false,
        _donorsLoaded: false,
        _photoCountsLoaded: false,
        viewDataLoading: false,

        // Pagination state
        transactionsPage: 1,
        transactionsTotalPages: 1,
        transactionsTotalItems: 0,
        transactionsLoadingMore: false,

        budgetFeedPage: 1,
        budgetFeedTotalPages: 1,
        budgetFeedTotalItems: 0,
        budgetFeedLoadingMore: false,

        donorLaborLogsPage: 1,
        donorLaborLogsTotalPages: 1,
        donorLaborLogsTotalItems: 0,
        donorLaborLogsLoadingMore: false,
        settingsId: null, // Store the settings record ID to avoid List/Search
        settings: {
            // Active settings
            scholarshipRate: 360,
            theme: loadThemeFromStorage(),
            // NEW: Risk learning model settings
            learnedRiskBase: 1.0,
            completedStepsCount: 0
        },

        urgencyDefs: URGENCY_DEFS,
        breadthDefs: BREADTH_DEFS,
        depthDefs: DEPTH_DEFS,
        neglectednessDefs: NEGLECTEDNESS_DEFS,
        confidenceDefs: CONFIDENCE_DEFS,

        modalProject: { tiers: [], categories: [], coordinates: null }, // coordinates: { lat: number, lng: number } or null
        modalScholarship: { name: '', description: '', startDate: '', endDate: '', fixedCost: 0, walletId: null, feedback: '' },
        descriptionEditor: null, // Quill editor instance for project description
        scholarshipDescriptionEditor: null, // Quill editor for scholarship description
        scholarshipFeedbackEditor: null, // Quill editor for scholarship feedback
        showMapPicker: false, // For project creation - map picker modal
        mapPickerCoordinates: null, // Temporary coordinates while picking
        
        sessionBudget: 0,
        simBudget: 0,
        lastSessionBudget: 0,
        
        // Transaction filters
        filterWallet: 'all',
        filterType: 'all',
        
        // Category replacement modal
        showCategoryReplaceModal: false,
        categoryToDelete: null,
        categoryToDeleteId: null, // category record id (for DB delete)
        projectsUsingCategory: [], // Array of { project, replacement: categoryId or '' }
        replacementCategory: null,
        // Edit category modal
        showEditCategoryModal: false,
        editingCategoryId: null,
        editingCategoryName: '',
        editingCategoryNameEs: '',
        editingCategoryColor: '',
        // Preset colors for category edit (Agriculture, Health, Education, Community, Infrastructure)
        categoryPresetColors: [
            { name: 'Agriculture', hex: '#78e08f' },
            { name: 'Health', hex: '#e55039' },
            { name: 'Education', hex: '#f6b93b' },
            { name: 'Community', hex: '#a55eea' },
            { name: 'Infrastructure', hex: '#6a89cc' }
        ],
        // User management (Settings)
        usersList: [],
        showUserModal: false,
        userModalMode: 'create', // 'create' | 'edit'
        userForm: { username: '', password: '', passwordConfirm: '', role: 'staff' },
        userFormId: null,
        
        // Map functionality
        showMap: false,
        showMapModal: false,
        mapModalProject: null, // Project to show in map modal
        mapInstance: null, // Google Maps instance (for backlog/completed)
        mapMarkers: [], // Array of marker objects (for backlog/completed)
        mapInfoWindow: null, // InfoWindow for click details (for backlog/completed)
        mapTooltip: null, // Custom tooltip div for hover (for backlog/completed)
        highlightedProjectId: null, // ID of project being highlighted
        
        // Dashboard map functionality
        dashboardMapInstance: null, // Google Maps instance for dashboard
        dashboardMapMarkers: [], // Array of marker objects for dashboard
        dashboardMapInfoWindow: null, // InfoWindow for dashboard map
        dashboardMapTooltip: null, // Custom tooltip for dashboard map
        dashboardMapFilter: 'all', // Filter for dashboard map: 'all', 'completed', 'in_progress', 'backlog'
        fundingGapCategoryFilter: 'All', // Filter for funding gap chart by category
        bubbleChartTooltip: null, // Tooltip for bubble chart
        
        // Chart.js instances for new stats page
        velocityChartInstance: null,
        radarChartInstance: null,
        allocationChartInstance: null,
        timelineChartInstance: null,
        costTypeDonutInstance: null,
        monthlyFlowChartInstance: null,
        tiersDistChartInstance: null,
        categoryCompletionChartInstance: null,
        valueDistChartInstance: null,
        transactionTypesDonutInstance: null,
        walletShareDonutInstance: null,
        // Wild charts (second batch)
        allocationVsVerifiedScatterInstance: null,
        allocationVsVerifiedZonesChartInstance: null,
        moneyByCategoryDonutInstance: null,
        cumulativeCompletionsLineInstance: null,
        topProjectsByValueBarInstance: null,
        tierStatusPieInstance: null,
        reimbursementRateBarInstance: null,
        ngoVsCommunityHoursInstance: null,
        onBudgetByCategoryChartInstance: null,
        showProjectDetailsModal: false, // Modal to show expanded project block
        projectDetailsModalProject: null, // Project to show in details modal
        
        // Manual Cash Grant
        showManualGrantDialog: false, // Dialog for manual grant confirmation
        manualGrantTier: null, // Tier to grant funds to
        manualGrantWallet: null, // Selected wallet for manual grant
        manualGrantAmount: 0, // Amount to grant (for divisible tiers)
        manualGrantBreakdown: { assets: 0, services: 0, logistics: 0, support: 0 }, // Cost breakdown for divisible tiers
        showInKindAllocationDialog: false, // Dialog for in-kind allocation
        inKindAllocationItem: null, // In-kind item to allocate
        inKindAllocationLabor: { people: 0, hours: 0, rate: 0 }, // Planned labor for allocation
        inKindAllocationCosts: { assets: 0, services: 0, logistics: 0, support: 0 }, // Monetary costs for allocation
        inKindAllocationWallet: null, // Selected wallet for in-kind allocation
        inKindGrantAmount: 0, // Amount to grant for in-kind divisible tiers (legacy - for verification)
        inKindManualCosts: {
            assets: 0,
            services: 0,
            logistics: 0,
            support: 0
        }, // Manual cost inputs for in-kind operations
        inKindManualLabor: {
            people: 0,
            hours: 0,
            rate: 0
        }, // Manual labor inputs for divisible in-kind tiers
        searchManualGrant: '', // Search filter for manual grant tab
        queueTierFilter: 'all', // 'all' or 'inkind' - filter for Project Queue
        
        // Export for reporting (date range + progress)
        showExportReportModal: false,
        exportDateFrom: (() => { const d = new Date(); d.setMonth(0); d.setDate(1); return d.toISOString().slice(0, 10); })(),
        exportDateTo: new Date().toISOString().slice(0, 10),
        exportReportInProgress: false,
        exportProgress: 0,
        exportProgressMessage: '',
        // Reset database modal
        showResetDatabaseModal: false,
        resetConfirmationText: '',
        proposals: [],
        walletDraws: {},
        
        // Logbook (load only when user visits Logbook tab)
        logbookEntries: [],
        logbookLoading: false,
        logbookFilterFrom: '',   // date string YYYY-MM-DD, empty = no lower bound
        logbookFilterTo: '',     // date string YYYY-MM-DD, empty = no upper bound
        logbookFilterEventType: 'all', // 'all' | 'Auth' | 'Project' | 'Step' | 'Grant' | 'Wallet' | 'Scholarship' | 'Export' | 'Note' | 'Risk model' | 'Other'
        logbookFilterUser: 'all',

        // Compassionate/Empathic Giving Flow
        grantPhase: null,        // null | 'compassion' | 'empathy'
        compassionRatio: 85,     // Slider value (50-99), default 85%
        compassionTotal: 0,      // Final compassion spend (locked after phase 1)
        empathyBudget: 0,        // Calculated: compassionTotal × (empathyRatio/compassionRatio)
        empathySelections: [],   // Array of tier objects selected in phase 2
        showConfirmSelectionsModal: false, // Modal to confirm all selections before finalizing
        showUnselectTierModal: false, // Modal to confirm unselecting a tier
        unselectTierData: null, // Data for the tier being unselected { tierId, projName, level, selectionType }
        showEmpathyExplanationModal: false, // Modal explaining compassion/empathy giving
        showRiskGuideModal: false, // Modal showing Risk and scoring guide (RISK_AND_SCORING_EXPLAINED.md)
        
        // Step section modal (project modal: Impact / Monetary / In-Kind / Community)
        stepModalSection: null, // 'impact' | 'monetary' | 'inkind' | 'community'
        stepModalTierIndex: null, // index in modalProject.tiers
        // Which step sections have been confirmed (user clicked Done): key = 'projectId-tierIndex', value = { impact: true, ... }
        confirmedStepSections: {},
        // Inline confirm for Remove Step in project modal
        confirmRemoveTier: false,

        // Contacts management modal
        showContactsModal: false,
        newContactName: '',
        newContactPhone: '',
        
        // Step-specific gallery (for step start/complete photos)
        showStepGalleryModal: false, // Step gallery manager modal
        stepGalleryContext: null, // 'step_start' | 'step_complete'
        stepGalleryTier: null, // Current tier for step gallery
        stepGalleryProject: null, // Current project for step gallery
        stepGalleryPhotos: [], // Photos for current step context
        stepGalleryUploadFiles: [], // Files to upload for step
        
        // Step gallery viewer (in timeline)
        showStepGalleryViewer: false, // Step gallery viewer modal
        stepGalleryViewerPhotos: [], // Loaded photos for step
        stepGalleryViewerIndex: 0, // Current photo index

        // Project Research modal (todos, attachments, comments)
        showProjectResearchModal: false,
        projectResearchProject: null,
        projectResearchTodos: [],
        projectResearchAttachments: [],
        projectResearchComments: [],
        projectResearchLoading: false,
        projectResearchError: null,
        projectResearchNewTodoText: '',
        projectResearchCommentContent: '',
        projectResearchCommentEditor: null, // Quill instance for new comment
        projectResearchEditingTodoId: null, // Inline edit: which todo is being edited
        projectResearchEditingCommentId: null, // Which comment is being edited
        projectResearchCommentEditEditor: null, // Quill instance for editing a comment

        // PM Research Import (for project creation modal)
        showPmResearchPicker: false,
        pmResearchLists: [],
        pmResearchLoading: false,

        // Icon tooltip: 'projectId-map' | 'projectId-gallery' | 'projectId-timeline' | 'projectId-research' | 'modal-map' | ... or null
        iconTooltip: null,

        // FM App Modal (iframe)
        showFmModal: false,

        // AI Chat Assistant
        aiChatOpen: false,
        aiChatMessages: [],   // [{ role: 'user'|'assistant', content, timestamp }]
        aiChatInput: '',
        aiChatLoading: false,
        aiChatRecordId: null, // PB record id for persistence
        aiChatLoaded: false,  // whether initial load has been attempted
    }
}
