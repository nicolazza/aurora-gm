/**
 * Gallery & Photo Methods
 * ~915 lines
 */
import { pb, collectionIdCache } from '../config.js'

export async function openGalleryViewer(proj) {
    // Opens gallery viewer (read-only) for guests/staff/admin
    // PERFORMANCE: Lazy load photos - only load first photo initially
    this.showLoading("Loading gallery...");
    
    try {
        // First, get total count of photos (lightweight query)
        // Shows ALL photos for this project (project-level + step start/complete)
        const photoList = await pb.collection('photos').getList(1, 1, {
            filter: `project = "${proj.id}"`,
            sort: 'created', // Order by upload date (first uploaded first)
            expand: 'tier,intervention'
        });
        
        this.galleryPhotoCount = photoList.totalItems || 0;
        
        if (this.galleryPhotoCount === 0) {
            // No photos
            this.activeProjectGallery = { ...proj, photos: [] };
            this.galleryIndex = 0;
            this.galleryPhotos = [];
            this.showGalleryModal = true;
            this.hideLoading();
            return;
        }
        
        // Load first photo only
        const firstPhoto = await pb.collection('photos').getList(1, 1, {
            filter: `project = "${proj.id}"`,
            sort: 'created', // Order by upload date
            expand: 'tier,intervention'
        });
        
        this.galleryPhotos = new Array(this.galleryPhotoCount); // Pre-allocate array
        this.galleryPhotos[0] = firstPhoto.items[0];
        this.activeProjectGallery = {
            ...proj,
            photos: [firstPhoto.items[0]], // Only first photo initially
            _totalPhotos: this.galleryPhotoCount // Store count for display
        };
        this.galleryIndex = 0;
        this.showGalleryModal = true;
        this.hideLoading();
        
        // Preload next photo in background (if exists)
        if (this.galleryPhotoCount > 1) {
            this.loadGalleryPhoto(1);
        }
    } catch (error) {
        this.hideLoading();
        console.error("Error loading gallery:", error);
        this.showNotification("Failed to load gallery.", "error");
    }
}

export async function loadGalleryPhoto(index) {
    // Lazy load a specific photo by index
    if (!this.activeProjectGallery || index < 0 || index >= this.galleryPhotoCount) {
        return;
    }
    
    // Check if already loaded
    if (this.galleryPhotos[index]) {
        return; // Already loaded
    }
    
    try {
        this.galleryLoadingPhoto = true;
        
        // Load photo at specific index (1-based in PocketBase)
        const photoResult = await pb.collection('photos').getList(index + 1, 1, {
            filter: `project = "${this.activeProjectGallery.id}"`,
            sort: 'created', // Order by upload date
            expand: 'tier,intervention'
        });
        
        if (photoResult.items && photoResult.items.length > 0) {
            // Insert photo at correct index
            this.galleryPhotos[index] = photoResult.items[0];
            // Update activeProjectGallery photos array with loaded photos only
            if (this.activeProjectGallery) {
                this.activeProjectGallery.photos = this.galleryPhotos.filter(p => p !== undefined && p !== null);
            }
        }
        
        this.galleryLoadingPhoto = false;
    } catch (error) {
        this.galleryLoadingPhoto = false;
        console.error(`Error loading photo at index ${index}:`, error);
    }
}

export function closeGalleryViewer() {
    // Reset gallery state when closing
    this.showGalleryModal = false;
    this.galleryPhotos = [];
    this.galleryPhotoCount = 0;
    this.galleryIndex = 0;
    this.galleryLoadingPhoto = false;
    this.activeProjectGallery = null;
}

export async function navigateGallery(direction) {
    // Navigate gallery and lazy load photos
    let newIndex;
    if (typeof direction === 'number') {
        // Direct index navigation (from thumbnail click)
        newIndex = direction;
    } else {
        // Direction-based navigation
        newIndex = direction === 'next' 
            ? (this.galleryIndex + 1) % this.galleryPhotoCount
            : (this.galleryIndex - 1 + this.galleryPhotoCount) % this.galleryPhotoCount;
    }
    
    if (newIndex < 0 || newIndex >= this.galleryPhotoCount) {
        return;
    }
    
    // Load photo if not already loaded
    if (!this.galleryPhotos[newIndex]) {
        this.galleryLoadingPhoto = true;
        await this.loadGalleryPhoto(newIndex);
    }
    
    this.galleryIndex = newIndex;
    
    // Update activeProjectGallery photos array with current loaded photos
    this.activeProjectGallery.photos = this.galleryPhotos.filter(p => p !== undefined && p !== null);
    
    // Preload adjacent photos in background
    const nextIndex = (newIndex + 1) % this.galleryPhotoCount;
    const prevIndex = (newIndex - 1 + this.galleryPhotoCount) % this.galleryPhotoCount;
    
    if (!this.galleryPhotos[nextIndex] && this.galleryPhotoCount > 1) {
        this.loadGalleryPhoto(nextIndex); // Don't await - load in background
    }
    if (!this.galleryPhotos[prevIndex] && this.galleryPhotoCount > 1) {
        this.loadGalleryPhoto(prevIndex); // Don't await - load in background
    }
}

export async function openGalleryManagementModal() {
    // Opens gallery management modal (on top of project modal)
    // This modal needs ALL photos loaded for management (upload/delete/set main)
    if (!this.modalProject || !this.modalProject.id) {
        this.showNotification("Please save the project first, then you can upload photos.", "error");
        return;
    }
    
    // If photos are already loaded, use them (no need to reload)
    if (this.modalProject.photos && Array.isArray(this.modalProject.photos) && this.modalProject.photos.length > 0) {
        // Photos already loaded, just open modal
        this.galleryUploadFiles = [];
        this.showGalleryManagementModal = true;
        return;
    }
    
    // Load all project-level photos for management (context = 'project' only)
    try {
        this.showLoading("Loading photos...");
        const photos = await pb.collection('photos').getFullList({
            filter: `project = "${this.modalProject.id}" && context = "project"`,
            sort: 'order,created'
        });
        
        this.modalProject.photos = photos;
        // Update photo count cache
        this.modalProject._photoCountCache = photos.length;
        this.galleryUploadFiles = [];
        this.showGalleryManagementModal = true;
        this.hideLoading();
    } catch (error) {
        this.hideLoading();
        console.error("Error loading photos:", error);
        this.showNotification("Failed to load photos.", "error");
    }
}

export function getProjectPhotoCount(project) {
    // Get photo count - check photos array if loaded, otherwise use cached count
    if (!project || !project.id) return 0;
    
    // If photos array is loaded and has items, use that
    if (project.photos && Array.isArray(project.photos) && project.photos.length > 0) {
        return project.photos.length;
    }
    
    // Return cached count if available
    return project._photoCountCache || 0;
}

export async function fetchProjectPhotoCount(project) {
    // Fetch photo count from database and cache it
    if (!project || !project.id) return 0;
    
    // If photos array is already loaded, use that (faster)
    if (project.photos && Array.isArray(project.photos) && project.photos.length > 0) {
        project._photoCountCache = project.photos.length;
        return project.photos.length;
    }
    
    // Otherwise fetch count from database (all photos including step photos)
    try {
        const photoList = await pb.collection('photos').getList(1, 1, {
            filter: `project = "${project.id}"`
        });
        const count = photoList.totalItems || 0;
        // Cache the count on the project object (Vue 3 - direct assignment works)
        project._photoCountCache = count;
        return count;
    } catch (e) {
        console.warn('Failed to fetch photo count:', e);
        project._photoCountCache = 0;
        return 0;
    }
}

export function openGallery(proj) {
    // Opens gallery management (for modal) - syncs with modalProject
    this.activeProjectGallery = proj;
    this.galleryIndex = 0;
    this.galleryUploadFiles = [];
}

export function handleGalleryFileSelect(event) {
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    
    // Filter out oversized files and show warning
    const validFiles = [];
    const oversizedFiles = [];
    
    files.forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
            oversizedFiles.push(file.name);
        } else {
            validFiles.push(file);
        }
    });
    
    if (oversizedFiles.length > 0) {
        this.showNotification(`Some files are too large (max 10MB) and were skipped: ${oversizedFiles.join(', ')}`, "warning");
    }
    
    if (validFiles.length > 0) {
        this.galleryUploadFiles = [...this.galleryUploadFiles, ...validFiles];
    }
    
    // Reset input
    if (this.$refs.galleryFileInput) {
        this.$refs.galleryFileInput.value = '';
    }
}

export function removeGalleryFile(index) {
    this.galleryUploadFiles.splice(index, 1);
}

export async function uploadGalleryImages() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to upload photos.", "error");
        return;
    }
    
    const projectToUpdate = this.modalProject.id ? this.modalProject : this.activeProjectGallery;
    
    if (!projectToUpdate || !projectToUpdate.id) {
        this.showNotification("Error: Project must be saved first. Please save the project, then upload photos.", "error");
        return;
    }
    
    const filesToUpload = this.galleryUploadFiles.length;
    if (filesToUpload === 0) {
        this.showNotification("Please select photos to upload.", "error");
        return;
    }
    
    // Validate file sizes (max 10MB per file)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = this.galleryUploadFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
        this.showNotification(`Some files are too large (max 10MB): ${oversizedFiles.map(f => f.name).join(', ')}`, "error");
        return;
    }
    
    try {
        this.uploadProgress = 0;
        this.showLoading(`Uploading ${filesToUpload} photo(s)...`);
        
        // Get current photos count to set order
        const existingPhotos = this.modalProject.photos || [];
        let nextOrder = existingPhotos.length;
        const hadPhotosBefore = existingPhotos.length > 0;
        
        const uploadedPhotos = [];
        
        // Upload each file as a separate photo record with real progress tracking
        for (let i = 0; i < this.galleryUploadFiles.length; i++) {
            const file = this.galleryUploadFiles[i];
            const fileStartProgress = Math.round((i / filesToUpload) * 100);
            const fileEndProgress = Math.round(((i + 1) / filesToUpload) * 100);
            
            try {
                // Create FormData for this photo
                const formData = new FormData();
                formData.append('image', file);
                formData.append('project', projectToUpdate.id);
                formData.append('context', 'project'); // Project-level photos
                formData.append('order', String(nextOrder + i));
                // Ensure isMain is always boolean (true/false, never null)
                formData.append('isMain', (i === 0 && !hadPhotosBefore) ? 'true' : 'false'); // First photo is main if no photos exist
                
                // Use XHR for real upload progress tracking
                const photo = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
                    const url = `${baseUrl}/api/collections/photos/records`;
                    
                    // Track upload progress for this file
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            // Calculate overall progress: fileStartProgress + (fileProgress * fileRange)
                            const fileProgress = e.loaded / e.total;
                            const fileRange = fileEndProgress - fileStartProgress;
                            const overallProgress = fileStartProgress + (fileProgress * fileRange);
                            this.uploadProgress = Math.round(overallProgress);
                        }
                    });
                    
                    xhr.addEventListener('load', () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const response = JSON.parse(xhr.responseText);
                                resolve(response);
                            } catch (e) {
                                reject(new Error('Invalid response from server'));
                            }
                        } else {
                            try {
                                const error = JSON.parse(xhr.responseText);
                                reject(new Error(error.message || `Server error: ${xhr.status}`));
                            } catch (e) {
                                reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
                            }
                        }
                    });
                    
                    xhr.addEventListener('error', () => {
                        reject(new Error('Network error during upload'));
                    });
                    
                    xhr.addEventListener('abort', () => {
                        reject(new Error('Upload aborted'));
                    });
                    
                    // IMPORTANT: open() must be called BEFORE setRequestHeader()
                    xhr.open('POST', url);
                    
                    // Set auth header (must be after open())
                    const authToken = pb.authStore.token;
                    if (authToken) {
                        xhr.setRequestHeader('Authorization', authToken);
                    }
                    
                    xhr.send(formData);
                });
                
                uploadedPhotos.push(photo);
                console.log(`Uploaded photo ${i + 1}/${filesToUpload}:`, photo.id);
            } catch (photoError) {
                console.error(`Error uploading photo ${i + 1}:`, photoError);
                throw new Error(`Failed to upload ${file.name}: ${photoError.message}`);
            }
        }
        
        // Ensure progress is 100% after all uploads
        this.uploadProgress = 100;
        
        // If this is the first photo, set it as main photo in project
        if (!hadPhotosBefore && uploadedPhotos.length > 0) {
            const firstPhoto = uploadedPhotos[0];
            await pb.collection('projects').update(projectToUpdate.id, {
                mainPhoto: firstPhoto.id
            });
        }
        
        // Reload project-level photos for modalProject (since we're in management modal)
        if (this.showGalleryManagementModal) {
            const updatedPhotos = await pb.collection('photos').getFullList({
                filter: `project = "${projectToUpdate.id}" && context = "project"`,
                sort: 'order,created'
            });
            this.modalProject.photos = updatedPhotos;
            // Update photo count cache
            this.modalProject._photoCountCache = updatedPhotos.length;
            
            // Update mainPhoto - use uploaded first photo if it was the first, otherwise keep existing
            if (!hadPhotosBefore && uploadedPhotos.length > 0) {
                this.modalProject.mainPhoto = uploadedPhotos[0].id;
            }
        }
        
        // Update projects list (for thumbnail in project list view)
        // Only fetch the specific project's mainPhoto relation, not all projects
        const projectIndex = this.projects.findIndex(p => p.id === projectToUpdate.id);
        if (projectIndex !== -1) {
            try {
                // Fetch just this project with expanded mainPhoto to update thumbnail
                const updatedProject = await pb.collection('projects').getOne(projectToUpdate.id, {
                    expand: 'mainPhoto'
                });
                // Update the project in the list with the expanded mainPhoto
                this.projects[projectIndex].mainPhoto = updatedProject.expand?.mainPhoto || updatedProject.mainPhoto || (uploadedPhotos.length > 0 && !hadPhotosBefore ? uploadedPhotos[0].id : this.projects[projectIndex].mainPhoto);
            } catch (e) {
                // Fallback: just update the ID
                console.warn('Failed to fetch updated mainPhoto:', e);
                if (!hadPhotosBefore && uploadedPhotos.length > 0) {
                    this.projects[projectIndex].mainPhoto = uploadedPhotos[0].id;
                }
            }
        }
        
        // Clear upload files
        this.galleryUploadFiles = [];
        if (this.$refs.galleryFileInput) {
            this.$refs.galleryFileInput.value = '';
        }
        
        this.uploadProgress = 0;
        this.hideLoading();
        this.showNotification(`Successfully uploaded ${filesToUpload} photo(s)!`, "success");
    } catch (error) {
        this.uploadProgress = 0;
        this.hideLoading();
        console.error("Error uploading photos:", error);
        let errorMsg = "Failed to upload photos.";
        if (error.message) {
            errorMsg = error.message;
        }
        this.showNotification(errorMsg, "error");
    }
}

export async function deleteGalleryImageFromModal(index) {
    if (!this.modalProject || !this.modalProject.id) {
        this.showNotification("Error: Invalid project data.", "error");
        return;
    }
    
    const photos = this.modalProject.photos || [];
    if (index >= photos.length) {
        this.showNotification("Error: Invalid photo index.", "error");
        return;
    }
    
    const photoToDelete = photos[index];
    if (!photoToDelete || !photoToDelete.id) {
        this.showNotification("Error: Invalid photo data.", "error");
        return;
    }
    
    this.showConfirm(
        "Delete this photo? This cannot be undone.",
        async () => {
            try {
                this.showLoading("Deleting photo...");
                
                // Check if this was the main photo
                const wasMainPhoto = this.modalProject.mainPhoto === photoToDelete.id || 
                                    (photoToDelete.isMain === true);
                
                // Delete the photo record
                await pb.collection('photos').delete(photoToDelete.id);
                
                // If this was the main photo, set a new main photo
                if (wasMainPhoto) {
                    const remainingPhotos = photos.filter((p, i) => i !== index);
                    if (remainingPhotos.length > 0) {
                        const newMainPhoto = remainingPhotos[0];
                        await pb.collection('projects').update(this.modalProject.id, {
                            mainPhoto: newMainPhoto.id
                        });
                        // Also update isMain flag
                        await pb.collection('photos').update(newMainPhoto.id, {
                            isMain: true
                        });
                    } else {
                        // No photos left, clear mainPhoto
                        await pb.collection('projects').update(this.modalProject.id, {
                            mainPhoto: null
                        });
                    }
                }
                
                // Refresh projects to update mainPhoto relation
                await this.fetchProjects();
                
                // Reload photos for modalProject (since we're in management modal)
                if (this.showGalleryManagementModal) {
                    const updatedPhotos = await pb.collection('photos').getFullList({
                        filter: `project.id = "${this.modalProject.id}"`,
                        sort: 'order,created'
                    });
                    this.modalProject.photos = updatedPhotos;
                    
                    // Update mainPhoto from refreshed project
                    const refreshedProject = this.projects.find(p => p.id === this.modalProject.id);
                    if (refreshedProject) {
                        this.modalProject.mainPhoto = refreshedProject.mainPhoto;
                    }
                }
                
                this.hideLoading();
                this.showNotification("Photo deleted successfully!", "success");
            } catch (error) {
                this.hideLoading();
                console.error("Error deleting photo:", error);
                this.showNotification("Failed to delete photo: " + (error.message || "Unknown error"), "error");
            }
        }
    );
}

export async function setMainPhotoInModal(index) {
    if (!this.modalProject || !this.modalProject.photos || index >= this.modalProject.photos.length) {
        return;
    }
    
    const selectedPhoto = this.modalProject.photos[index];
    if (!selectedPhoto || !selectedPhoto.id) {
        return;
    }
    
    try {
        this.showLoading("Setting main photo...");
        
        // Update project's mainPhoto relation
        await pb.collection('projects').update(this.modalProject.id, {
            mainPhoto: selectedPhoto.id
        });
        
        // Update isMain flags: set selected to true, others to false
        // Update local state FIRST for immediate UI feedback
        const photos = this.modalProject.photos || [];
        photos.forEach(photo => {
            photo.isMain = photo.id === selectedPhoto.id;
        });
        this.modalProject.mainPhoto = selectedPhoto.id;
        
        // Update database in parallel (batch updates)
        const updatePromises = [];
        updatePromises.push(
            pb.collection('projects').update(this.modalProject.id, {
                mainPhoto: selectedPhoto.id
            })
        );
        
        // Update all photo isMain flags in parallel
        for (const photo of photos) {
            if (photo.id) {
                updatePromises.push(
                    pb.collection('photos').update(photo.id, {
                        isMain: photo.id === selectedPhoto.id
                    })
                );
            }
        }
        
        // Wait for all updates to complete
        await Promise.all(updatePromises);
        
        // Update projects list (for thumbnail in project list view)
        // Fetch only the updated mainPhoto relation for this specific project
        const projectIndex = this.projects.findIndex(p => p.id === this.modalProject.id);
        if (projectIndex !== -1) {
            try {
                // Fetch just this project with expanded mainPhoto to update thumbnail
                const updatedProject = await pb.collection('projects').getOne(this.modalProject.id, {
                    expand: 'mainPhoto'
                });
                // Update the project in the list with the expanded mainPhoto
                this.projects[projectIndex].mainPhoto = updatedProject.expand?.mainPhoto || updatedProject.mainPhoto || selectedPhoto.id;
            } catch (e) {
                // Fallback: just update the ID
                console.warn('Failed to fetch updated mainPhoto:', e);
                this.projects[projectIndex].mainPhoto = selectedPhoto.id;
            }
        }
        
        this.hideLoading();
        this.showNotification("Main photo updated successfully!", "success");
    } catch (error) {
        this.hideLoading();
        console.error("Error setting main photo:", error);
        this.showNotification("Failed to set main photo.", "error");
    }
}

export async function deleteGalleryImage(index) {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to delete photos.", "error");
        return;
    }
    
    if (!this.activeProjectGallery || !this.activeProjectGallery.id) {
        this.showNotification("Error: Invalid project data.", "error");
        return;
    }
    
    const photos = this.activeProjectGallery.photos || [];
    if (index >= photos.length) {
        this.showNotification("Error: Invalid photo index.", "error");
        return;
    }
    
    const photoToDelete = photos[index];
    if (!photoToDelete || !photoToDelete.id) {
        this.showNotification("Error: Invalid photo data.", "error");
        return;
    }
    
    this.showConfirm(
        "Delete this photo? This cannot be undone.",
        async () => {
            try {
                this.showLoading("Deleting photo...");
                
                // Check if this was the main photo
                const wasMainPhoto = this.activeProjectGallery.mainPhoto === photoToDelete.id || 
                                    (photoToDelete.isMain === true);
                
                // Delete the photo record
                await pb.collection('photos').delete(photoToDelete.id);
                
                // If this was the main photo, set a new main photo
                if (wasMainPhoto) {
                    const remainingPhotos = photos.filter((p, i) => i !== index);
                    if (remainingPhotos.length > 0) {
                        const newMainPhoto = remainingPhotos[0];
                        await pb.collection('projects').update(this.activeProjectGallery.id, {
                            mainPhoto: newMainPhoto.id
                        });
                        await pb.collection('photos').update(newMainPhoto.id, {
                            isMain: true
                        });
                    } else {
                        await pb.collection('projects').update(this.activeProjectGallery.id, {
                            mainPhoto: null
                        });
                    }
                }
                
                // Refresh projects
                await this.fetchProjects();
                
                const refreshedProject = this.projects.find(p => p.id === this.activeProjectGallery.id);
                if (refreshedProject) {
                    this.activeProjectGallery = refreshedProject;
                }
                
                this.hideLoading();
                this.showNotification("Photo deleted successfully!", "success");
            } catch (error) {
                this.hideLoading();
                console.error("Error deleting photo:", error);
                this.showNotification("Failed to delete photo: " + (error.message || "Unknown error"), "error");
            }
        }
    );
}

export async function setMainPhoto(index) {
    if (!this.activeProjectGallery || !this.activeProjectGallery.photos || index >= this.activeProjectGallery.photos.length) {
        return;
    }
    
    const selectedPhoto = this.activeProjectGallery.photos[index];
    if (!selectedPhoto || !selectedPhoto.id) {
        return;
    }
    
    try {
        // Update project's mainPhoto relation
        await pb.collection('projects').update(this.activeProjectGallery.id, {
            mainPhoto: selectedPhoto.id
        });
        
        // Update isMain flags
        const photos = this.activeProjectGallery.photos || [];
        for (const photo of photos) {
            if (photo.id) {
                await pb.collection('photos').update(photo.id, {
                    isMain: photo.id === selectedPhoto.id
                });
            }
        }
        
        // Refresh to get updated data
        await this.fetchProjects();
        const refreshedProject = this.projects.find(p => p.id === this.activeProjectGallery.id);
        if (refreshedProject) {
            this.activeProjectGallery = {
                ...refreshedProject,
                photos: this.activeProjectGallery.photos // Keep loaded photos
            };
        }
        
        // Also update modalProject if it's the same project
        if (this.modalProject && this.modalProject.id === this.activeProjectGallery.id) {
            const refreshedModalProject = this.projects.find(p => p.id === this.modalProject.id);
            if (refreshedModalProject) {
                this.modalProject.mainPhoto = refreshedModalProject.mainPhoto;
            }
        }
    } catch (error) {
        console.error("Error setting main photo:", error);
        this.showNotification("Failed to set main photo.", "error");
    }
}

export async function cleanupBrokenMainPhotoRelations() {
    // Clean up projects with broken mainPhoto relations (pointing to deleted photos)
    // Run this in background, don't block UI
    try {
        const projectsWithMainPhoto = this.projects.filter(p => p.mainPhoto && typeof p.mainPhoto === 'string');
        if (projectsWithMainPhoto.length === 0) {
            return; // No projects with mainPhoto IDs to check
        }
        
        // Check which mainPhoto IDs are valid (photos exist)
        const mainPhotoIds = [...new Set(projectsWithMainPhoto.map(p => p.mainPhoto))];
        const validPhotoIds = new Set();
        
        // Check each photo ID
        for (const photoId of mainPhotoIds) {
            try {
                await pb.collection('photos').getOne(photoId);
                validPhotoIds.add(photoId);
            } catch (e) {
                // Photo doesn't exist - it's a broken relation
                console.log(`Photo ${photoId} doesn't exist - will clear mainPhoto relation`);
            }
        }
        
        // Clear broken mainPhoto relations
        const projectsToFix = projectsWithMainPhoto.filter(p => !validPhotoIds.has(p.mainPhoto));
        if (projectsToFix.length > 0) {
            console.log(`Clearing broken mainPhoto relations for ${projectsToFix.length} projects`);
            
            for (const project of projectsToFix) {
                try {
                    await pb.collection('projects').update(project.id, {
                        mainPhoto: null
                    });
                    // Update local state
                    project.mainPhoto = null;
                } catch (e) {
                    console.warn(`Failed to clear mainPhoto for project ${project.id}:`, e);
                }
            }
        }
    } catch (error) {
        console.warn('Error cleaning up broken mainPhoto relations:', error);
        // Don't fail - this is a background cleanup
    }
}

export function getMainImageUrl(project, useThumbnail = false) {
    if (!project) return null;
    
    // Try mainPhoto relation first (this is loaded via expand in fetchProjects)
    if (project.mainPhoto) {
        // If mainPhoto is an object (expanded relation), use it directly
        if (typeof project.mainPhoto === 'object' && project.mainPhoto !== null && project.mainPhoto.id) {
            const url = this.getPhotoUrl(project.mainPhoto, useThumbnail);
            if (url) {
                return url;
            }
            // If getPhotoUrl returned null, photo might be broken
            return null;
        }
        
        // If mainPhoto is a string ID, try to find it in photos array
        if (typeof project.mainPhoto === 'string') {
            const photos = project.photos || [];
            const foundPhoto = photos.find(p => p.id === project.mainPhoto);
            if (foundPhoto) {
                return this.getPhotoUrl(foundPhoto, useThumbnail);
            }
            
            // Photos array is empty, and we have mainPhoto ID
            // This might be a broken relation - return null (will show placeholder)
            return null;
        }
    }
    
    // Fallback to first photo with isMain flag (ensure isMain is boolean true, not just truthy)
    const photos = project.photos || [];
    const mainPhotoByFlag = photos.find(p => p.isMain === true);
    if (mainPhotoByFlag) {
        return this.getPhotoUrl(mainPhotoByFlag, useThumbnail);
    }
    
    // Fallback to first photo
    if (photos.length > 0) {
        return this.getPhotoUrl(photos[0], useThumbnail);
    }
    
    return null;
}

export function getPhotoUrl(photo, useThumbnail = false) {
    if (!photo || !photo.id) return null;
    
    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    
    // Get image filename first (needed for both thumbnail and full image)
    const image = typeof photo.image === 'string' 
        ? photo.image 
        : (photo.image?.filename || photo.image);
    
    if (!image) {
        console.warn('Photo has no image field:', photo);
        return null;
    }
    
    // Check if it's already a URL
    if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
        return image;
    }
    
    // Construct base file URL
    const fileUrl = `${baseUrl}/api/files/photos/${photo.id}/${image}`;
    
    // Use thumbnail if requested
    // PocketBase generates thumbnails on-the-fly using ?thumb=WxH query parameter
    // The thumb size must be configured in the image field settings (e.g., "200x200")
    // IMPORTANT: Images uploaded BEFORE configuring thumb sizes may not have thumbnails
    // You may need to re-upload photos after configuring thumb sizes
    if (useThumbnail) {
        // Use PocketBase's auto-generated thumbnail via query parameter
        // Format: /api/files/{collection}/{recordId}/{filename}?thumb={size}
        // Try 200x200 first (center crop) - must match exactly what's in "Thumb sizes" field
        // If that doesn't work, images may need to be re-uploaded after configuring thumb sizes
        const thumbnailUrl = `${fileUrl}?thumb=200x200`;
        if (window.DEBUG_THUMBNAILS) {
            console.log('Using PocketBase auto-generated thumbnail:', thumbnailUrl);
        }
        return thumbnailUrl;
    }
    
    // Use full image
    return fileUrl;
}

export function getImageUrl(image, projectId = null) {
    // Legacy support - if image is a photo object, use getPhotoUrl
    if (image && typeof image === 'object' && image.id) {
        return this.getPhotoUrl(image);
    }
    
    // Legacy format - might be a string (old format)
    if (typeof image === 'string') {
        if (image.startsWith('http://') || image.startsWith('https://')) {
            return image;
        }
        // Old format - try to find in photos
        console.warn('Legacy image format detected:', image);
        return null;
    }
    
    return null;
}

export function hasRealImages(project) {
    if (!project) return false;
    // mainPhoto set (thumbnail available)
    if (project.mainPhoto) {
        return true;
    }
    // Photos array (e.g. in gallery management modal)
    const photos = project.photos || [];
    if (photos.length > 0) return true;
    // Any photos for this project (including step_start/step_complete) – so camera opens slider
    return (project._photoCountCache || 0) > 0;
}

export function handleImageError(event) {
    // Replace broken image with placeholder
    event.target.style.display = 'none';
}

export function handleThumbnailError(event, project) {
    // If thumbnail fails to load, try full image as fallback
    const img = event.target;
    const fullImageUrl = img.getAttribute('data-full-image-url');
    const thumbnailUrl = img.getAttribute('data-thumbnail-url');
    
    // Only fallback if we were trying to load thumbnail and it's different from full image
    if (fullImageUrl && thumbnailUrl && fullImageUrl !== thumbnailUrl && img.src === thumbnailUrl) {
        // Thumbnail doesn't exist, use full image
        img.src = fullImageUrl;
        if (window.DEBUG_THUMBNAILS) {
            console.log('Thumbnail failed, using full image for project:', project.id);
        }
    } else {
        // Full image also failed or same URL, hide image
        img.style.display = 'none';
    }
}

export function nextImage() {
    this.navigateGallery('next');
}

export function prevImage() {
    this.navigateGallery('prev');
}

// ==================== STEP GALLERY METHODS ====================

/**
 * Open step gallery manager for uploading photos during step start/complete
 * @param {string} context - 'step_start' or 'step_complete'
 * @param {object} tier - The tier object
 * @param {object} project - The project object
 */
export async function openStepGalleryManager(context, tier, project) {
    if (!tier || !tier.id || !project || !project.id) {
        this.showNotification("Error: Invalid step or project data.", "error");
        return;
    }
    
    this.stepGalleryContext = context;
    this.stepGalleryTier = tier;
    this.stepGalleryProject = project;
    this.stepGalleryUploadFiles = [];
    
    // Load existing photos for this step/context
    try {
        this.showLoading("Loading photos...");
        const photos = await pb.collection('photos').getFullList({
            filter: `project = "${project.id}" && tier = "${tier.id}" && context = "${context}"`,
            sort: 'order,created'
        });
        this.stepGalleryPhotos = photos;
        this.showStepGalleryModal = true;
        this.hideLoading();
        // Update step photo count on start/complete modal so badge shows
        if (context === 'step_start' && this.startProjectData) {
            this.startProjectData._stepStartPhotoCount = photos.length;
        }
        if (context === 'step_complete' && this.completeProjectData) {
            this.completeProjectData._stepCompletePhotoCount = photos.length;
        }
    } catch (error) {
        this.hideLoading();
        console.error("Error loading step photos:", error);
        this.showNotification("Failed to load photos.", "error");
    }
}

/**
 * Close step gallery manager
 */
export function closeStepGalleryManager() {
    // Persist count to start/complete modal before clearing
    if (this.stepGalleryContext === 'step_start' && this.startProjectData) {
        this.startProjectData._stepStartPhotoCount = this.stepGalleryPhotos.length;
    }
    if (this.stepGalleryContext === 'step_complete' && this.completeProjectData) {
        this.completeProjectData._stepCompletePhotoCount = this.stepGalleryPhotos.length;
    }
    this.showStepGalleryModal = false;
    this.stepGalleryContext = null;
    this.stepGalleryTier = null;
    this.stepGalleryProject = null;
    this.stepGalleryPhotos = [];
    this.stepGalleryUploadFiles = [];
}

/**
 * Handle file selection for step gallery
 */
export function handleStepGalleryFileSelect(event) {
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    
    const validFiles = [];
    const oversizedFiles = [];
    
    files.forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
            oversizedFiles.push(file.name);
        } else {
            validFiles.push(file);
        }
    });
    
    if (oversizedFiles.length > 0) {
        this.showNotification(`Some files are too large (max 10MB) and were skipped: ${oversizedFiles.join(', ')}`, "warning");
    }
    
    if (validFiles.length > 0) {
        this.stepGalleryUploadFiles = [...this.stepGalleryUploadFiles, ...validFiles];
    }
    
    // Reset input
    if (this.$refs.stepGalleryFileInput) {
        this.$refs.stepGalleryFileInput.value = '';
    }
}

/**
 * Remove file from step gallery upload list
 */
export function removeStepGalleryFile(index) {
    this.stepGalleryUploadFiles.splice(index, 1);
}

/**
 * Upload photos for step (start or complete)
 */
export async function uploadStepGalleryImages() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to upload photos.", "error");
        return;
    }
    
    if (!this.stepGalleryProject || !this.stepGalleryProject.id || !this.stepGalleryTier || !this.stepGalleryTier.id) {
        this.showNotification("Error: Invalid step or project data.", "error");
        return;
    }
    
    const filesToUpload = this.stepGalleryUploadFiles.length;
    if (filesToUpload === 0) {
        this.showNotification("Please select photos to upload.", "error");
        return;
    }
    
    try {
        this.uploadProgress = 0;
        this.showLoading(`Uploading ${filesToUpload} photo(s)...`);
        
        // Get current photo count for order
        let nextOrder = this.stepGalleryPhotos.length;
        const uploadedPhotos = [];
        
        for (let i = 0; i < this.stepGalleryUploadFiles.length; i++) {
            const file = this.stepGalleryUploadFiles[i];
            const fileStartProgress = Math.round((i / filesToUpload) * 100);
            const fileEndProgress = Math.round(((i + 1) / filesToUpload) * 100);
            
            try {
                const formData = new FormData();
                formData.append('image', file);
                formData.append('project', this.stepGalleryProject.id);
                formData.append('tier', this.stepGalleryTier.id);
                formData.append('context', this.stepGalleryContext);
                formData.append('order', String(nextOrder + i));
                formData.append('isMain', 'false'); // Step photos are never main
                
                const photo = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
                    const url = `${baseUrl}/api/collections/photos/records`;
                    
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const fileProgress = e.loaded / e.total;
                            const fileRange = fileEndProgress - fileStartProgress;
                            const overallProgress = fileStartProgress + (fileProgress * fileRange);
                            this.uploadProgress = Math.round(overallProgress);
                        }
                    });
                    
                    xhr.addEventListener('load', () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                reject(new Error('Invalid response from server'));
                            }
                        } else {
                            try {
                                const error = JSON.parse(xhr.responseText);
                                reject(new Error(error.message || `Server error: ${xhr.status}`));
                            } catch (e) {
                                reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
                            }
                        }
                    });
                    
                    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
                    
                    xhr.open('POST', url);
                    const authToken = pb.authStore.token;
                    if (authToken) {
                        xhr.setRequestHeader('Authorization', authToken);
                    }
                    xhr.send(formData);
                });
                
                uploadedPhotos.push(photo);
            } catch (photoError) {
                console.error(`Error uploading photo ${i + 1}:`, photoError);
                throw new Error(`Failed to upload ${file.name}: ${photoError.message}`);
            }
        }
        
        this.uploadProgress = 100;
        
        // Reload photos for this step
        const updatedPhotos = await pb.collection('photos').getFullList({
            filter: `project = "${this.stepGalleryProject.id}" && tier = "${this.stepGalleryTier.id}" && context = "${this.stepGalleryContext}"`,
            sort: 'order,created'
        });
        this.stepGalleryPhotos = updatedPhotos;
        
        // Update step photo count on start/complete modal for badge
        if (this.stepGalleryContext === 'step_start' && this.startProjectData) {
            this.startProjectData._stepStartPhotoCount = this.stepGalleryPhotos.length;
        }
        if (this.stepGalleryContext === 'step_complete' && this.completeProjectData) {
            this.completeProjectData._stepCompletePhotoCount = this.stepGalleryPhotos.length;
        }
        
        // Clear upload files
        this.stepGalleryUploadFiles = [];
        if (this.$refs.stepGalleryFileInput) {
            this.$refs.stepGalleryFileInput.value = '';
        }
        
        this.uploadProgress = 0;
        this.hideLoading();
        this.showNotification(`Successfully uploaded ${filesToUpload} photo(s)!`, "success");
    } catch (error) {
        this.uploadProgress = 0;
        this.hideLoading();
        console.error("Error uploading step photos:", error);
        this.showNotification("Failed to upload photos: " + error.message, "error");
    }
}

/**
 * Delete a photo from step gallery
 */
export async function deleteStepGalleryPhoto(photoId) {
    if (!confirm("Are you sure you want to delete this photo?")) return;
    
    try {
        this.showLoading("Deleting photo...");
        await pb.collection('photos').delete(photoId);
        
        // Remove from local array
        this.stepGalleryPhotos = this.stepGalleryPhotos.filter(p => p.id !== photoId);
        
        this.hideLoading();
        this.showNotification("Photo deleted.", "success");
    } catch (error) {
        this.hideLoading();
        console.error("Error deleting photo:", error);
        this.showNotification("Failed to delete photo.", "error");
    }
}

/**
 * Open step gallery viewer (read-only, for viewing in timeline)
 * @param {object} tier - The tier object
 * @param {string} context - 'step_start' or 'step_complete'
 * @param {string} projectId - The project ID
 */
export async function openStepGalleryViewer(tier, context, projectId) {
    if (!tier || !tier.id || !projectId) {
        this.showNotification("Error: Invalid step data.", "error");
        return;
    }
    
    try {
        this.showLoading("Loading photos...");
        const photos = await pb.collection('photos').getFullList({
            filter: `project = "${projectId}" && tier = "${tier.id}" && context = "${context}"`,
            sort: 'order,created'
        });
        
        if (photos.length === 0) {
            this.hideLoading();
            this.showNotification("No photos for this step.", "info");
            return;
        }
        
        this.stepGalleryViewerPhotos = photos;
        this.stepGalleryViewerIndex = 0;
        this.showStepGalleryViewer = true;
        this.hideLoading();
    } catch (error) {
        this.hideLoading();
        console.error("Error loading step photos:", error);
        this.showNotification("Failed to load photos.", "error");
    }
}

/**
 * Close step gallery viewer
 */
export function closeStepGalleryViewer() {
    this.showStepGalleryViewer = false;
    this.stepGalleryViewerPhotos = [];
    this.stepGalleryViewerIndex = 0;
}

/**
 * Navigate step gallery viewer
 */
export function navigateStepGalleryViewer(direction) {
    const count = this.stepGalleryViewerPhotos.length;
    if (count === 0) return;
    
    if (direction === 'next') {
        this.stepGalleryViewerIndex = (this.stepGalleryViewerIndex + 1) % count;
    } else if (direction === 'prev') {
        this.stepGalleryViewerIndex = (this.stepGalleryViewerIndex - 1 + count) % count;
    } else if (typeof direction === 'number') {
        this.stepGalleryViewerIndex = direction;
    }
}

/**
 * Get photo count for a specific step and context
 * @param {string} tierId - The tier ID
 * @param {string} context - 'step_start' or 'step_complete'
 * @param {string} projectId - The project ID
 * @returns {Promise<number>}
 */
export async function getStepPhotoCount(tierId, context, projectId) {
    if (!tierId || !context || !projectId) return 0;
    
    try {
        const result = await pb.collection('photos').getList(1, 1, {
            filter: `project = "${projectId}" && tier = "${tierId}" && context = "${context}"`
        });
        return result.totalItems || 0;
    } catch (error) {
        console.warn('Failed to get step photo count:', error);
        return 0;
    }
}
