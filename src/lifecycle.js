/**
 * Vue Lifecycle Hooks
 * ~50 lines
 */

import { pb } from './config.js'
import { initForest, destroyForest } from './pixel-forest.js'

export async function mounted() {
    // Show body after Vue is ready to prevent flash
    this.$nextTick(() => {
        document.body.classList.add('vue-ready');
        initForest();
    });
    
    // Force confirm dialog to be hidden on startup
    this.$nextTick(() => {
        this.confirmDialog = {
            show: false,
            message: '',
            onConfirm: null,
            onCancel: null
        };
    });
    
    this.apiBase = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');

    // Fetch guest access setting (fire-and-forget, does not block app startup)
    pb.collection('pm_settings').getFirstListItem('id != ""', { requestKey: null }).then((pmSettings) => {
        const ga = pmSettings?.guest_access;
        if (ga && typeof ga === 'object' && ga.gm === true) {
            this.isGuestMode = true;
        }
    }).catch(() => { /* pm_settings not accessible or not found */ });

    if (pb.authStore.isValid) {
        this.isAuthenticated = true;
        this.currentUser = pb.authStore.model;
        this.userRole = pb.authStore.model?.role || 'admin';
        this.userPermissions = pb.authStore.model?.permissions || {};
        await this.fetchCoreData();
    }

    pb.authStore.onChange(() => {
        if (pb.authStore.isValid) {
            this.isAuthenticated = true;
            this.currentUser = pb.authStore.model;
            this.userRole = pb.authStore.model?.role || 'admin';
            this.userPermissions = pb.authStore.model?.permissions || {};
            this.fetchCoreData();
        } else {
            this.isAuthenticated = false;
            this.currentUser = null;
            this.userPermissions = {};
        }
    });

    window.addEventListener('resize', this.updateChartLine);
    window.addEventListener('click', () => { this.activeBreakdownTier = null; });
}

export function beforeUnmount() {
    window.removeEventListener('resize', this.updateChartLine);
    window.removeEventListener('click', () => { this.activeBreakdownTier = null; });
    // Clean up map tooltip
    if (this.mapTooltip && this.mapTooltip.parentNode) {
        this.mapTooltip.parentNode.removeChild(this.mapTooltip);
    }
}
