/**
 * Vue Watchers
 * ~200 lines
 */

import { applyThemeCSSVars } from './methods/fetch.js';

export const watch = {
    'settings.theme': {
        handler(theme) {
            if (theme) applyThemeCSSVars(theme);
        },
        deep: true
    },
    dashboardTab(newVal, oldVal) {
        if (this.currentView !== 'stats') return;
        this.$nextTick(() => {
            setTimeout(() => {
                if (this.currentView !== 'stats') return;
                if (newVal === 'financial') this.initFinancialCharts();
                else if (newVal === 'projects') this.initProjectCharts();
                else if (newVal === 'impact') this.initImpactCharts();
                else if (newVal === 'algorithm') this.initAlgorithmCharts();
                else if (newVal === 'activity') this.initActivityCharts();
                if (newVal === 'glance') {
                    setTimeout(() => {
                        const mapEl = document.getElementById('dashboardMap');
                        if (mapEl && !this.dashboardMapInstance) {
                            this.initDashboardMap();
                        } else if (this.dashboardMapInstance) {
                            this.updateDashboardMapMarkers();
                        }
                    }, 100);
                }
            }, 200);
        });
    },
    grantViewMode(newVal) {
        // Load logbook only when user visits the Logbook tab (not on app open)
        if (newVal === 'logbook') {
            this.loadLogbook();
        }
    },
    sessionBudget(newVal) {
        if (newVal > 0) {
            // Initialize compassion phase when budget is entered
            if (this.grantPhase !== 'empathy') {
                this.grantPhase = 'compassion';
            }
            this.runAlgorithm(newVal);
        } else {
            this.proposals = [];
            // Reset phase when budget is cleared
            if (this.grantPhase === 'compassion') {
                this.grantPhase = null;
            }
        }
    },
    // Update map markers when filters change
    visibleBacklog() {
        // Only update map if we're on backlog page and map is visible
        if (this.currentView === 'projects' && this.projectsTab === 'backlog' && this.showMap && this.mapInstance) {
            this.$nextTick(() => {
                this.updateMapMarkers();
            });
        }
    },
    visibleCompleted() {
        // Only update map if we're on completed page and map is visible
        if (this.currentView === 'projects' && this.projectsTab === 'completed' && this.showMap && this.mapInstance) {
            this.$nextTick(() => {
                this.updateMapMarkers();
            });
        }
    },
    projectsTab() {
        if (this.currentView === 'projects' && this.showMap) {
            this.showMap = false;
            this.clearMap();
            this.mapInstance = null;
        }
    },
    showMap(newVal) {
        if (newVal) {
            this.$nextTick(() => {
                this.initMap();
            });
        } else {
            this.clearMap();
        }
    },
    currentView(newVal, oldVal) {
        // Re-init home view animations
        if (newVal === 'home') {
            if (this.projects && this.projects.length > 0) {
                this.animateHeroNumbers();
            }
            this.$nextTick(() => {
                import('./pixel-forest.js').then(m => {
                    m.destroyForest();
                    m.initForest();
                });
            });
        }
        // Lazy-load data for the target view
        if (this.isAuthenticated) {
            this.ensureViewData(newVal);
        }
        // Load photo counts on first visit to projects view
        if (newVal === 'projects' && !this._photoCountsLoaded) {
            this.fetchPhotoCountsForProjects();
        }
        // Load users when opening Settings (admin view)
        if (newVal === 'admin' && this.isAdmin) {
            this.fetchUsers();
        }
        // Reinitialize map if coming back to projects page and map is already open
        if (newVal === 'projects' && this.showMap) {
            this.$nextTick(() => {
                setTimeout(() => {
                    if (this.showMap && this.currentView === 'projects') {
                        if (this.mapInstance) {
                            this.clearMap();
                            this.mapInstance = null;
                        }
                        // Reinitialize map
                        this.initMap();
                    }
                }, 100);
            });
        }
        
        
        // Initialize dashboard map when switching to stats page (glance tab)
        if (newVal === 'stats' && this.dashboardTab === 'glance') {
            this.$nextTick(() => {
                setTimeout(() => {
                    const mapElement = document.getElementById('dashboardMap');
                    if (!mapElement) return;
                    if (this.dashboardMapInstance) {
                        try {
                            const mapDiv = this.dashboardMapInstance.getDiv();
                            if (!mapDiv || mapDiv !== mapElement) {
                                this.dashboardMapInstance = null;
                                this.dashboardMapMarkers = [];
                            }
                        } catch (e) {
                            this.dashboardMapInstance = null;
                            this.dashboardMapMarkers = [];
                        }
                    }
                    if (!this.dashboardMapInstance) {
                        this.initDashboardMap();
                    } else {
                        this.updateDashboardMapMarkers();
                    }
                }, 100);
            });
        }
        // Initialize charts for whichever dashboard tab is active
        if (newVal === 'stats' && this.dashboardTab !== 'glance') {
            this.$nextTick(() => {
                setTimeout(() => {
                    if (this.dashboardTab === 'financial') this.initFinancialCharts();
                    else if (this.dashboardTab === 'projects') this.initProjectCharts();
                    else if (this.dashboardTab === 'impact') this.initImpactCharts();
                    else if (this.dashboardTab === 'algorithm') this.initAlgorithmCharts();
                    else if (this.dashboardTab === 'activity') this.initActivityCharts();
                }, 200);
            });
        }
        
        // Analytics page merged into dashboard tabs — redirect legacy route
        if (newVal === 'analytics') {
            this.currentView = 'stats';
            this.dashboardTab = 'financial';
            return;
        }
        
        // When leaving stats page, clear map markers
        if (oldVal === 'stats' && newVal !== 'stats') {
            if (this.dashboardMapMarkers && this.dashboardMapMarkers.length > 0) {
                try {
                    this.dashboardMapMarkers.forEach(marker => {
                        try { marker.setMap(null); } catch (e) {}
                    });
                    this.dashboardMapMarkers = [];
                } catch (e) {}
            }
            if (this.dashboardMapInfoWindow) {
                try { this.dashboardMapInfoWindow.close(); } catch (e) {}
            }
        }
    }
};
