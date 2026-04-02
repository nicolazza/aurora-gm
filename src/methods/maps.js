/**
 * Map & Dashboard Map Methods
 * ~915 lines
 */

export function toggleMap() {
    this.showMap = !this.showMap;
    if (this.showMap) {
        this.$nextTick(() => {
            this.initMap();
        });
    } else {
        this.clearMap();
    }
}

export function initMap() {
    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded. Please add your API key.');
        this.showNotification("Google Maps API not loaded. Please add your API key in the HTML head.", "error");
        return;
    }
    
    if (this.currentView !== 'projects') {
        return;
    }
    
    const mapElement = document.getElementById('projectsMap');
    if (!mapElement) return;
    
    // Clear existing map if any
    if (this.mapInstance) {
        this.clearMap();
        this.mapInstance = null;
    }
    
    // Default center
    const defaultCenter = { lat: 8.5131, lng: -81.0784 };
    
    // Calculate center from visible projects with coordinates
    const visibleProjects = this.projectsTab === 'backlog' ? this.visibleBacklog : this.visibleCompleted;
    const projectsWithCoords = visibleProjects.filter(p => p.coordinates && p.coordinates.lat && p.coordinates.lng);
    
    let center = defaultCenter;
    if (projectsWithCoords.length > 0) {
        const avgLat = projectsWithCoords.reduce((sum, p) => sum + p.coordinates.lat, 0) / projectsWithCoords.length;
        const avgLng = projectsWithCoords.reduce((sum, p) => sum + p.coordinates.lng, 0) / projectsWithCoords.length;
        center = { lat: avgLat, lng: avgLng };
    }
    
    // Initialize map
    this.mapInstance = new google.maps.Map(mapElement, {
        center: center,
        zoom: projectsWithCoords.length > 0 ? 10 : 12,
        mapTypeControl: true,
        streetViewControl: false,
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            },
            {
                featureType: 'poi',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });
    
    // Initialize info window (for detailed view on click)
    this.mapInfoWindow = new google.maps.InfoWindow();
    
    // Listen for InfoWindow close event to ensure tooltip can show again
    google.maps.event.addListener(this.mapInfoWindow, 'closeclick', () => {
        // Ensure tooltip is hidden when InfoWindow closes
        if (this.mapTooltip) {
            this.mapTooltip.style.display = 'none';
        }
    });
    
    // Create custom tooltip div (for simple name on hover)
    this.mapTooltip = document.createElement('div');
    this.mapTooltip.style.cssText = 'position: fixed; background-color: rgba(0, 0, 0, 0.8); color: white; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 13px; pointer-events: none; z-index: 1000; display: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: translateX(-50%);';
    document.body.appendChild(this.mapTooltip);
    
    // Update markers
    this.updateMapMarkers();
}

export function updateMapMarkers() {
    try {
        if (!this.mapInstance || !window.google || !window.google.maps) {
            return;
        }
        
        if (this.currentView !== 'projects') {
            return;
        }
        
        // CRITICAL: Clear ALL existing markers FIRST, before any filtering
        if (!this.mapMarkers) {
            this.mapMarkers = [];
        }
        
        // Store current markers count for debugging
        const markersCountBefore = this.mapMarkers.length;
        
        // Remove ALL existing markers from the map - iterate backwards to avoid index issues
        for (let i = this.mapMarkers.length - 1; i >= 0; i--) {
            const marker = this.mapMarkers[i];
            try {
                if (marker) {
                    // First hide the marker
                    if (typeof marker.setVisible === 'function') {
                        marker.setVisible(false);
                    }
                    // Then remove from map completely
                    if (typeof marker.setMap === 'function') {
                        marker.setMap(null);
                    }
                    // Clear all event listeners to prevent memory leaks
                    if (google.maps && google.maps.event) {
                        google.maps.event.clearInstanceListeners(marker);
                    }
                }
            } catch (e) {
                console.warn('Error clearing marker:', e);
            }
        }
        
        // Clear the array completely
        this.mapMarkers = [];
        
        // Debug log
        if (markersCountBefore > 0) {
            console.log(`Cleared ${markersCountBefore} markers from map`);
        }
        
        // Use requestAnimationFrame to ensure DOM updates before creating new markers
        requestAnimationFrame(() => {
            this.createMapMarkers();
        });
    } catch (error) {
        console.error('Error updating map markers:', error);
    }
}

export function createMapMarkers() {
    try {
        if (!this.mapInstance || !window.google || !window.google.maps) {
            return;
        }
        
        if (this.currentView !== 'projects') {
            return;
        }
        
        // Verify markers array is empty before creating new ones
        if (this.mapMarkers.length > 0) {
            console.error('ERROR: mapMarkers array is not empty! Length:', this.mapMarkers.length);
            // Force clear again
            this.mapMarkers.forEach(m => {
                try {
                    if (m) {
                        m.setVisible(false);
                        m.setMap(null);
                        google.maps.event.clearInstanceListeners(m);
                    }
                } catch (e) {}
            });
            this.mapMarkers = [];
        }
        
        // Get visible projects based on current page (respecting filters, but WITHOUT pagination limit)
        // Use filteredProjectsForMap which includes all matching projects, not just the paginated subset
        const visibleProjects = this.projectsTab === 'backlog' ? this.filteredProjectsForMapBacklog : this.filteredProjectsForMapCompleted;
        const projectsWithCoords = visibleProjects.filter(p => p.coordinates && p.coordinates.lat && p.coordinates.lng);
        
        if (projectsWithCoords.length === 0) {
            // No projects to show - adjust map view to default
            if (this.mapInstance) {
                this.mapInstance.setCenter({ lat: 8.5131, lng: -81.0784 });
                this.mapInstance.setZoom(12);
            }
            return;
        }
        
        // Create markers for each project
        projectsWithCoords.forEach(proj => {
        const category = proj.categories && proj.categories.length > 0 ? proj.categories[0] : 'default';
        const markerColor = this.getCategoryColor(category);
        
        // Convert hex color to RGB for marker
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        
        const rgb = hexToRgb(markerColor) || { r: 149, g: 165, b: 166 }; // Default gray
        
        // Create custom marker icon
        const markerIcon = {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: markerColor,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2
        };
        
        // Create marker WITHOUT adding to map first
        const marker = new google.maps.Marker({
            position: { lat: proj.coordinates.lat, lng: proj.coordinates.lng },
            icon: markerIcon,
            title: proj.title,
            animation: google.maps.Animation.DROP,
            map: null // Explicitly set to null initially
        });
        
        // Add to map AFTER creation (this ensures we have full control)
        marker.setMap(this.mapInstance);
        
        // Detailed info window content for click
        const progress = this.getProjectProgress(proj);
        const infoContent = `
            <div style="min-width: 200px; padding: 8px;">
                <h4 style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${proj.title}</h4>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
                    <div><strong>Category:</strong> ${proj.categories ? proj.categories.join(', ') : 'N/A'}</div>
                    <div><strong>Value:</strong> $${this.formatMoney(proj.type === 'scholarship' ? proj.value : this.getTotalCost(proj))}</div>
                    <div><strong>Progress:</strong> ${progress.toFixed(0)}%</div>
                </div>
                <button onclick="window.vueApp.scrollToProjectFromMap('${proj.id}')" style="width: 100%; padding: 6px 12px; background-color: #10b981; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">See Details</button>
            </div>
        `;
        
        // Function to update tooltip position
        const updateTooltipPosition = () => {
            if (!this.mapTooltip) return;
            
            const latLng = marker.getPosition();
            const self = this;
            
            // Use OverlayView to convert lat/lng to pixel coordinates
            const overlay = new google.maps.OverlayView();
            overlay.onAdd = function() {};
            overlay.onRemove = function() {};
            overlay.draw = function() {
                const projection = this.getProjection();
                const point = projection.fromLatLngToContainerPixel(latLng);
                
                // Get the map container's position on the page
                const mapDiv = self.mapInstance.getDiv();
                const mapRect = mapDiv.getBoundingClientRect();
                
                // Calculate tooltip position relative to viewport
                // point.x and point.y are relative to the map container
                const tooltipX = mapRect.left + point.x;
                const tooltipY = mapRect.top + point.y - 35; // 35px above marker
                
                if (self.mapTooltip) {
                    self.mapTooltip.style.left = tooltipX + 'px';
                    self.mapTooltip.style.top = tooltipY + 'px';
                }
            };
            overlay.setMap(this.mapInstance);
        };
        
        // Mouse-over: show custom tooltip (no close button)
        marker.addListener('mouseover', () => {
            // Only show tooltip if detailed info window is not open
            // Check if InfoWindow is actually open by checking if it has a map
            if (!this.mapInfoWindow.getMap()) {
                if (this.mapTooltip) {
                    this.mapTooltip.textContent = proj.title;
                    this.mapTooltip.style.display = 'block';
                    updateTooltipPosition();
                }
            }
        });
        
        // Mouse-move: update tooltip position (in case map moves)
        marker.addListener('mousemove', () => {
            // Only update if InfoWindow is not open
            if (!this.mapInfoWindow.getMap() && this.mapTooltip && this.mapTooltip.style.display === 'block') {
                updateTooltipPosition();
            }
        });
        
        // Mouse-out: hide custom tooltip
        marker.addListener('mouseout', () => {
            // Only hide if detailed info window is not open
            if (!this.mapInfoWindow.getMap()) {
                if (this.mapTooltip) {
                    this.mapTooltip.style.display = 'none';
                }
            }
        });
        
        // Update tooltip position when map is dragged or zoomed
        google.maps.event.addListener(this.mapInstance, 'drag', updateTooltipPosition);
        google.maps.event.addListener(this.mapInstance, 'zoom_changed', updateTooltipPosition);
        
        // Click: show detailed info window
        marker.addListener('click', () => {
            // Hide tooltip when showing detailed window
            if (this.mapTooltip) {
                this.mapTooltip.style.display = 'none';
            }
            this.mapInfoWindow.setContent(infoContent);
            this.mapInfoWindow.open(this.mapInstance, marker);
        });
        
            this.mapMarkers.push(marker);
        });
        
        // Fit bounds to show all markers
        if (projectsWithCoords.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            projectsWithCoords.forEach(proj => {
                bounds.extend({ lat: proj.coordinates.lat, lng: proj.coordinates.lng });
            });
            this.mapInstance.fitBounds(bounds);
            google.maps.event.addListenerOnce(this.mapInstance, 'bounds_changed', () => {
                if (this.mapInstance.getZoom() > 15) {
                    this.mapInstance.setZoom(15);
                }
            });
        }
    } catch (error) {
        console.error('Error creating map markers:', error);
    }
}

export function clearMap() {
    if (this.mapMarkers) {
        this.mapMarkers.forEach(marker => marker.setMap(null));
        this.mapMarkers = [];
    }
    if (this.mapInfoWindow) {
        this.mapInfoWindow.close();
    }
    if (this.mapTooltip) {
        this.mapTooltip.style.display = 'none';
    }
}

export function scrollToProject(projectId) {
    // Find the project element
    const projectElements = document.querySelectorAll('[data-project-id]');
    let targetElement = null;
    
    projectElements.forEach(el => {
        if (el.getAttribute('data-project-id') === projectId) {
            targetElement = el;
        }
    });
    
    if (targetElement) {
        // Close map info window if open
        if (this.mapInfoWindow) {
            this.mapInfoWindow.close();
        }
        
        // Scroll to element
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight with pulse animation
        this.highlightedProjectId = projectId;
        setTimeout(() => {
            this.highlightedProjectId = null;
        }, 3000);
    }
}

// Helper method for map button click (needs to be accessible from window)
export function scrollToProjectFromMap(projectId) {
    this.scrollToProject(projectId);
}

// ========== DASHBOARD MAP METHODS ==========
export function initDashboardMap() {
    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded.');
        return;
    }
    
    const mapElement = document.getElementById('dashboardMap');
    if (!mapElement) {
        console.warn('Dashboard map element not found in DOM');
        return;
    }
    
    // Clear any existing instance if it exists
    if (this.dashboardMapInstance) {
        try {
            // Clear markers first
            if (this.dashboardMapMarkers) {
                this.dashboardMapMarkers.forEach(marker => {
                    try {
                        marker.setMap(null);
                    } catch (e) {
                        // Ignore
                    }
                });
            }
            this.dashboardMapMarkers = [];
        } catch (e) {
            // Ignore errors
        }
    }
    
    // Default center
    const defaultCenter = { lat: 8.5131, lng: -81.0784 };
    
    // Get all projects with coordinates
    const allProjectsWithCoords = this.projects.filter(p => p.coordinates && p.coordinates.lat && p.coordinates.lng);
    
    let center = defaultCenter;
    if (allProjectsWithCoords.length > 0) {
        const avgLat = allProjectsWithCoords.reduce((sum, p) => sum + p.coordinates.lat, 0) / allProjectsWithCoords.length;
        const avgLng = allProjectsWithCoords.reduce((sum, p) => sum + p.coordinates.lng, 0) / allProjectsWithCoords.length;
        center = { lat: avgLat, lng: avgLng };
    }
    
    // Initialize map
    this.dashboardMapInstance = new google.maps.Map(mapElement, {
        center: center,
        zoom: allProjectsWithCoords.length > 0 ? 10 : 12,
        mapTypeControl: true,
        streetViewControl: false,
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            },
            {
                featureType: 'poi',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });
    
    // Initialize info window
    this.dashboardMapInfoWindow = new google.maps.InfoWindow();
    
    // Create custom tooltip div
    if (!this.dashboardMapTooltip) {
        this.dashboardMapTooltip = document.createElement('div');
        this.dashboardMapTooltip.style.cssText = 'position: fixed; background-color: rgba(0, 0, 0, 0.8); color: white; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 13px; pointer-events: none; z-index: 1000; display: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: translateX(-50%);';
        document.body.appendChild(this.dashboardMapTooltip);
    }
    
    // Update markers
    this.updateDashboardMapMarkers();
}

export function updateDashboardMapMarkers() {
    try {
        if (!window.google || !window.google.maps) {
            return;
        }
        
        // Check if map element exists in DOM
        const mapElement = document.getElementById('dashboardMap');
        if (!mapElement) {
            // Map element doesn't exist (probably switched pages)
            if (this.dashboardMapInstance) {
                this.dashboardMapInstance = null;
            }
            return;
        }
        
        // If no map instance, initialize it
        if (!this.dashboardMapInstance) {
            this.initDashboardMap();
            return;
        }
        
        // Verify map instance is still valid
        try {
            const mapDiv = this.dashboardMapInstance.getDiv();
            if (!mapDiv || mapDiv !== mapElement) {
                // Map instance points to wrong element - reinitialize
                this.dashboardMapInstance = null;
                this.initDashboardMap();
                return;
            }
        } catch (e) {
            // Map instance is invalid - reinitialize
            console.warn('Dashboard map instance invalid, reinitializing:', e);
            this.dashboardMapInstance = null;
            this.initDashboardMap();
            return;
        }
        
        // CRITICAL: Clear ALL existing markers FIRST, before any filtering
        // This ensures old markers are completely removed before new ones are created
        if (!this.dashboardMapMarkers) {
            this.dashboardMapMarkers = [];
        }
        
        // Store current markers count for debugging
        const markersCountBefore = this.dashboardMapMarkers.length;
        
        // Remove ALL existing markers from the map - iterate backwards to avoid index issues
        for (let i = this.dashboardMapMarkers.length - 1; i >= 0; i--) {
            const marker = this.dashboardMapMarkers[i];
            try {
                if (marker) {
                    // First hide the marker
                    if (typeof marker.setVisible === 'function') {
                        marker.setVisible(false);
                    }
                    // Then remove from map completely
                    if (typeof marker.setMap === 'function') {
                        marker.setMap(null);
                    }
                    // Clear all event listeners to prevent memory leaks
                    if (google.maps && google.maps.event) {
                        google.maps.event.clearInstanceListeners(marker);
                    }
                }
            } catch (e) {
                console.warn('Error clearing marker:', e);
            }
        }
        
        // Clear the array completely - use assignment to ensure it's truly empty
        this.dashboardMapMarkers = [];
        
        // Debug log
        if (markersCountBefore > 0) {
            console.log(`Cleared ${markersCountBefore} markers from dashboard map`);
        }
        
        this.createDashboardMarkers();
    } catch (error) {
        console.error('Error updating dashboard map markers:', error);
        // Don't crash the app if map update fails
    }
}

export function createDashboardMarkers() {
    try {
        if (!this.dashboardMapInstance || !window.google || !window.google.maps) {
            return;
        }
        
        // Get all projects with coordinates (exclude scholarships)
        let allProjectsWithCoords = this.projects.filter(p => 
            p.coordinates && 
            p.coordinates.lat && 
            p.coordinates.lng &&
            p.type !== 'scholarship' // Exclude scholarships from dashboard map
        );
        
        // Determine project state for filtering and marker color
        const isProjectCompleted = (proj) => {
            if (!proj.tiers || proj.tiers.length === 0) return false;
            return proj.tiers.every(t => t.status === 'completed');
        };
        const hasAnyTierInProgress = (proj) => {
            return proj.tiers && proj.tiers.some(t => t.status === 'in_progress');
        };
        const isProjectFullyBacklog = (proj) => {
            if (!proj.tiers || proj.tiers.length === 0) return false;
            return proj.tiers.every(t => t.status === 'backlog' || !t.status);
        };
        
        // Apply filter: all | completed | in_progress | backlog
        if (this.dashboardMapFilter === 'completed') {
            allProjectsWithCoords = allProjectsWithCoords.filter(proj => isProjectCompleted(proj));
        } else if (this.dashboardMapFilter === 'in_progress') {
            allProjectsWithCoords = allProjectsWithCoords.filter(proj => hasAnyTierInProgress(proj));
        } else if (this.dashboardMapFilter === 'backlog') {
            allProjectsWithCoords = allProjectsWithCoords.filter(proj => isProjectFullyBacklog(proj));
        }
        
        if (allProjectsWithCoords.length === 0) {
            // No projects to show - adjust map view to default
            if (this.dashboardMapInstance) {
                this.dashboardMapInstance.setCenter({ lat: 8.5131, lng: -81.0784 });
                this.dashboardMapInstance.setZoom(12);
            }
            return;
        }
        
        // Verify markers array is empty before creating new ones
        if (this.dashboardMapMarkers.length > 0) {
            console.error('ERROR: dashboardMapMarkers array is not empty! Length:', this.dashboardMapMarkers.length);
            // Force clear again
            this.dashboardMapMarkers.forEach(m => {
                try {
                    if (m) {
                        m.setVisible(false);
                        m.setMap(null);
                        google.maps.event.clearInstanceListeners(m);
                    }
                } catch (e) {}
            });
            this.dashboardMapMarkers = [];
        }
        
        // Create markers for each project (filtered): green=completed, yellow=in progress, gray=backlog
        allProjectsWithCoords.forEach(proj => {
        const isCompleted = isProjectCompleted(proj);
        const inProgress = hasAnyTierInProgress(proj);
        const markerColor = isCompleted ? '#10b981' : (inProgress ? '#eab308' : '#9ca3af'); // green : yellow : gray-400 (lighter)
        
        // Create custom marker icon
        const markerIcon = {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: markerColor,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2
        };
        
        // Create marker WITHOUT adding to map first
        const marker = new google.maps.Marker({
            position: { lat: proj.coordinates.lat, lng: proj.coordinates.lng },
            icon: markerIcon,
            title: proj.title,
            animation: google.maps.Animation.DROP,
            map: null // Explicitly set to null initially
        });
        
        // Add to map AFTER creation (this ensures we have full control)
        marker.setMap(this.dashboardMapInstance);
        
        // Verify marker was added
        if (marker.getMap() !== this.dashboardMapInstance) {
            console.warn('Warning: Marker map property does not match dashboardMapInstance');
        }
        
        // Detailed info window content for click
        const progress = this.getProjectProgress(proj);
        const infoContent = `
            <div style="min-width: 200px; padding: 8px;">
                <h4 style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${proj.title}</h4>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
                    <div><strong>Category:</strong> ${proj.categories ? proj.categories.join(', ') : 'N/A'}</div>
                    <div><strong>Value:</strong> $${this.formatMoney(proj.type === 'scholarship' ? proj.value : this.getTotalCost(proj))}</div>
                    <div><strong>Progress:</strong> ${progress.toFixed(0)}%</div>
                    <div><strong>Status:</strong> ${isCompleted ? 'Completed' : (inProgress ? 'In Progress' : 'Backlog')}</div>
                </div>
                <button onclick="window.vueApp.openProjectDetailsModal('${proj.id}')" style="width: 100%; padding: 6px 12px; background-color: #10b981; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">See Details</button>
            </div>
        `;
        
        // Function to update tooltip position
        const updateTooltipPosition = () => {
            if (!this.dashboardMapTooltip) return;
            
            const latLng = marker.getPosition();
            const self = this;
            
            const overlay = new google.maps.OverlayView();
            overlay.onAdd = function() {};
            overlay.onRemove = function() {};
            overlay.draw = function() {
                const projection = this.getProjection();
                const point = projection.fromLatLngToContainerPixel(latLng);
                
                const mapDiv = self.dashboardMapInstance.getDiv();
                const mapRect = mapDiv.getBoundingClientRect();
                
                const tooltipX = mapRect.left + point.x;
                const tooltipY = mapRect.top + point.y - 35;
                
                if (self.dashboardMapTooltip) {
                    self.dashboardMapTooltip.style.left = tooltipX + 'px';
                    self.dashboardMapTooltip.style.top = tooltipY + 'px';
                }
            };
            overlay.setMap(this.dashboardMapInstance);
        };
        
        // Mouse-over: show custom tooltip (only when info window is not open - getMap() is null when closed)
        marker.addListener('mouseover', () => {
            if (!this.dashboardMapInfoWindow.getMap()) {
                if (this.dashboardMapTooltip) {
                    this.dashboardMapTooltip.textContent = proj.title || proj.name || '';
                    this.dashboardMapTooltip.style.display = 'block';
                    updateTooltipPosition();
                }
            }
        });
        
        // Mouse-move: update tooltip position
        marker.addListener('mousemove', () => {
            if (this.dashboardMapTooltip && this.dashboardMapTooltip.style.display === 'block') {
                updateTooltipPosition();
            }
        });
        
        // Mouse-out: hide custom tooltip
        marker.addListener('mouseout', () => {
            if (!this.dashboardMapInfoWindow.getMap()) {
                if (this.dashboardMapTooltip) {
                    this.dashboardMapTooltip.style.display = 'none';
                }
            }
        });
        
        // Update tooltip position when map is dragged or zoomed
        google.maps.event.addListener(this.dashboardMapInstance, 'drag', updateTooltipPosition);
        google.maps.event.addListener(this.dashboardMapInstance, 'zoom_changed', updateTooltipPosition);
        
        // Click: show detailed info window
        marker.addListener('click', () => {
            if (this.dashboardMapTooltip) {
                this.dashboardMapTooltip.style.display = 'none';
            }
            this.dashboardMapInfoWindow.setContent(infoContent);
            this.dashboardMapInfoWindow.open(this.dashboardMapInstance, marker);
        });
        
            this.dashboardMapMarkers.push(marker);
        });
        
        // Fit bounds to show all markers
        if (allProjectsWithCoords.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            allProjectsWithCoords.forEach(proj => {
                bounds.extend({ lat: proj.coordinates.lat, lng: proj.coordinates.lng });
            });
            this.dashboardMapInstance.fitBounds(bounds);
        }
    } catch (error) {
        console.error('Error creating dashboard markers:', error);
    }
}

export function openProjectDetailsModal(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (project) {
        this.projectDetailsModalProject = project;
        this.showProjectDetailsModal = true;
        // Close info window
        if (this.dashboardMapInfoWindow) {
            this.dashboardMapInfoWindow.close();
        }
        // Fire-and-forget: fetch PM stats for tier icons
        if (project.tiers?.length) {
            import('./projects.js').then(m => m.fetchPmStatsForTiers(project.tiers));
        }
    }
}

export function showBubbleTooltip(event, bubble) {
    // Create tooltip if it doesn't exist
    if (!this.bubbleChartTooltip) {
        this.bubbleChartTooltip = document.createElement('div');
        this.bubbleChartTooltip.style.cssText = 'position: fixed; background-color: rgba(0, 0, 0, 0.8); color: white; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 13px; pointer-events: none; z-index: 1000; display: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: translateX(-50%);';
        document.body.appendChild(this.bubbleChartTooltip);
    }
    
    this.bubbleChartTooltip.textContent = bubble.name;
    this.bubbleChartTooltip.style.display = 'block';
    
    // Position tooltip above mouse cursor
    const tooltipX = event.clientX;
    const tooltipY = event.clientY - 10;
    this.bubbleChartTooltip.style.left = tooltipX + 'px';
    this.bubbleChartTooltip.style.top = tooltipY + 'px';
}

export function hideBubbleTooltip() {
    if (this.bubbleChartTooltip) {
        this.bubbleChartTooltip.style.display = 'none';
    }
}

export function isProjectCompleted(proj) {
    if (proj.type === 'scholarship') {
        return !!proj.feedback;
    }
    if (!proj.tiers || proj.tiers.length === 0) return false;
    return proj.tiers.every(t => {
        const hasProof = t.proof && (Array.isArray(t.proof) ? t.proof.length > 0 : true);
        return t.status === 'completed' && hasProof;
    });
}

export function openMapPicker() {
    this.mapPickerCoordinates = this.modalProject.coordinates ? { ...this.modalProject.coordinates } : null;
    this.showMapPicker = true;
    this.$nextTick(() => {
        this.initMapPicker();
    });
}

export function initMapPicker() {
    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded.');
        return;
    }
    
    const mapElement = document.getElementById('mapPicker');
    if (!mapElement) return;
    
    // Default center
    const center = this.mapPickerCoordinates || { lat: 8.5131, lng: -81.0784 };
    
    const map = new google.maps.Map(mapElement, {
        center: center,
        zoom: this.mapPickerCoordinates ? 15 : 12,
        mapTypeControl: true
        // No POI hiding styles - allow businesses and landmarks to be visible for location reference
    });
    
    let marker = null;
    if (this.mapPickerCoordinates) {
        marker = new google.maps.Marker({
            position: center,
            map: map,
            draggable: true
        });
    }
    
    // Click or drag to set location
    map.addListener('click', (e) => {
        const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        this.mapPickerCoordinates = coords;
        
        if (marker) {
            marker.setPosition(coords);
        } else {
            marker = new google.maps.Marker({
                position: coords,
                map: map,
                draggable: true
            });
        }
    });
    
    if (marker) {
        marker.addListener('dragend', (e) => {
            this.mapPickerCoordinates = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        });
    }
}

export function closeMapPicker() {
    this.showMapPicker = false;
    this.mapPickerCoordinates = null;
}

export function confirmMapPicker() {
    if (this.mapPickerCoordinates) {
        this.modalProject.coordinates = { ...this.mapPickerCoordinates };
    }
    this.closeMapPicker();
}

export function openMapModal(project) {
    this.mapModalProject = project;
    this.showMapModal = true;
    this.$nextTick(() => {
        this.initMapModal();
    });
}

export function initMapModal() {
    if (!window.google || !window.google.maps || !this.mapModalProject || !this.mapModalProject.coordinates) {
        return;
    }
    
    const mapElement = document.getElementById('mapModal');
    if (!mapElement) return;
    
    const map = new google.maps.Map(mapElement, {
        center: { lat: this.mapModalProject.coordinates.lat, lng: this.mapModalProject.coordinates.lng },
        zoom: 15,
        mapTypeControl: true,
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            },
            {
                featureType: 'poi',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });
    
    const category = this.mapModalProject.categories && this.mapModalProject.categories.length > 0 ? this.mapModalProject.categories[0] : 'default';
    const markerColor = this.getCategoryColor(category);
    
    const marker = new google.maps.Marker({
        position: { lat: this.mapModalProject.coordinates.lat, lng: this.mapModalProject.coordinates.lng },
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: markerColor,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2
        },
        title: this.mapModalProject.title
    });
    
    const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:0;margin:0;"><h4 style="font-weight:bold;margin:0 0 4px;font-size:14px;">${this.mapModalProject.title}</h4><div style="font-size:11px;color:#666;"><div>Category: ${this.mapModalProject.categories ? this.mapModalProject.categories.join(', ') : 'N/A'}</div><div>Value: $${this.formatMoney(this.mapModalProject.type === 'scholarship' ? this.mapModalProject.value : this.getTotalCost(this.mapModalProject))}</div></div><hr style="border:none;border-top:1px solid #e5e7eb;margin:6px 0;"><div style="font-size:10px;color:#999;">${this.mapModalProject.coordinates.lat.toFixed(6)}, ${this.mapModalProject.coordinates.lng.toFixed(6)}</div></div>`,
        maxWidth: 250
    });

    google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
        const iwOuter = document.querySelector('.gm-style-iw-a');
        if (iwOuter) {
            const iwContent = iwOuter.querySelector('.gm-style-iw-d');
            if (iwContent) { iwContent.style.overflow = 'hidden'; iwContent.style.padding = '4px'; }
        }
    });
    
    infoWindow.open(map, marker);
}
