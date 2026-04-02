/**
 * Project Research modal: todos, attachments, comments
 */
import { pb } from '../config.js'

function getResearchUserDisplayName(userRecord) {
    if (!userRecord) return 'Unknown';
    const name = userRecord.name != null && String(userRecord.name).trim() ? String(userRecord.name).trim() : '';
    const username = userRecord.username != null && String(userRecord.username).trim() ? String(userRecord.username).trim() : '';
    const email = userRecord.email != null && String(userRecord.email).trim() ? String(userRecord.email).trim() : '';
    return name || username || email || 'Unknown';
}

export async function openProjectResearchModal(proj) {
    if (!proj || !proj.id) return;
    this.projectResearchProject = proj;
    this.projectResearchTodos = [];
    this.projectResearchAttachments = [];
    this.projectResearchComments = [];
    this.projectResearchError = null;
    this.projectResearchNewTodoText = '';
    this.projectResearchCommentContent = '';
    this.projectResearchEditingTodoId = null;
    this.projectResearchEditingCommentId = null;
    this.projectResearchCommentEditEditor = null;
    if (this.projectResearchCommentEditor) {
        this.projectResearchCommentEditor = null;
    }
    this.showProjectResearchModal = true;
    this.projectResearchLoading = true;
    try {
        const [todos, attachments, comments] = await Promise.all([
            pb.collection('project_todos').getFullList({ filter: `project = "${proj.id}"`, sort: 'order,created' }),
            pb.collection('project_attachments').getFullList({ filter: `project = "${proj.id}"`, sort: 'created' }),
            pb.collection('project_comments').getFullList({ filter: `project = "${proj.id}"`, sort: 'created', expand: 'user' })
        ]);
        this.projectResearchTodos = todos || [];
        this.projectResearchAttachments = attachments || [];
        this.projectResearchComments = comments || [];
    } catch (e) {
        console.warn('Project research load failed', e);
        this.projectResearchError = e.message || 'Failed to load research data.';
    } finally {
        this.projectResearchLoading = false;
    }
    this.$nextTick(() => this.initProjectResearchCommentEditor());
}

export function closeProjectResearchModal() {
    this.showProjectResearchModal = false;
    this.projectResearchProject = null;
    this.projectResearchTodos = [];
    this.projectResearchAttachments = [];
    this.projectResearchComments = [];
    this.projectResearchCommentEditor = null;
    this.projectResearchEditingTodoId = null;
    this.projectResearchEditingCommentId = null;
    this.projectResearchCommentEditEditor = null;
}

export function getResearchUserDisplayNameForComment(comment) {
    const user = comment.expand?.user || comment.user;
    if (typeof user === 'object') return getResearchUserDisplayName(user);
    return 'Unknown';
}

export function canDeleteProjectResearchComment(comment) {
    if (this.isAdmin) return true;
    const userId = this.currentUser?.id;
    if (!userId) return false;
    const commentUserId = typeof comment.user === 'string' ? comment.user : comment.expand?.user?.id;
    return commentUserId === userId;
}

export function canEditProjectResearchComment(comment) {
    return this.canDeleteProjectResearchComment(comment);
}

export function initProjectResearchCommentEditor() {
    const el = document.getElementById('project-research-comment-editor');
    if (!el) return;
    if (this.projectResearchCommentEditor) {
        this.projectResearchCommentEditor = null;
    }
    this.projectResearchCommentEditor = new Quill('#project-research-comment-editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                ['link'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['clean']
            ]
        },
        placeholder: 'Write a comment...'
    });
}

export async function addProjectResearchTodo() {
    const text = (this.projectResearchNewTodoText || '').trim();
    if (!text || !this.projectResearchProject) return;
    try {
        const maxOrder = this.projectResearchTodos.length
            ? Math.max(...this.projectResearchTodos.map(t => t.order ?? 0), 0)
            : 0;
        const record = await pb.collection('project_todos').create({
            project: this.projectResearchProject.id,
            content: text,
            status: 'pending',
            order: maxOrder + 1
        }, { requestKey: null });
        this.projectResearchTodos = [...this.projectResearchTodos, record];
        this.projectResearchNewTodoText = '';
    } catch (e) {
        this.showNotification(e.message || 'Failed to add todo', 'error');
    }
}

export function startEditProjectResearchTodo(todo) {
    this.projectResearchEditingTodoId = todo.id;
}

export function cancelEditProjectResearchTodo() {
    this.projectResearchEditingTodoId = null;
}

export async function updateProjectResearchTodo(todoId, updates) {
    try {
        await pb.collection('project_todos').update(todoId, updates);
        const idx = this.projectResearchTodos.findIndex(t => t.id === todoId);
        if (idx !== -1) {
            this.projectResearchTodos = this.projectResearchTodos.slice();
            this.projectResearchTodos[idx] = { ...this.projectResearchTodos[idx], ...updates };
        }
        this.projectResearchEditingTodoId = null;
    } catch (e) {
        this.showNotification(e.message || 'Failed to update todo', 'error');
    }
}

export async function toggleProjectResearchTodoComplete(todo) {
    const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
    await this.updateProjectResearchTodo(todo.id, { status: newStatus });
}

export async function deleteProjectResearchTodo(todoId) {
    try {
        await pb.collection('project_todos').delete(todoId);
        this.projectResearchTodos = this.projectResearchTodos.filter(t => t.id !== todoId);
    } catch (e) {
        this.showNotification(e.message || 'Failed to delete todo', 'error');
    }
}

export async function uploadProjectResearchAttachment(event) {
    const file = event.target?.files?.[0];
    if (!file || !this.projectResearchProject) return;
    const formData = new FormData();
    formData.append('project', this.projectResearchProject.id);
    formData.append('file', file);
    formData.append('name', file.name || 'Attachment');
    const userId = pb.authStore.model?.id;
    if (userId) formData.append('uploadedBy', userId);

    this.uploadProgress = 0;
    this.showLoading('Uploading attachment...');
    try {
        const record = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `${pb.baseUrl}/api/collections/project_attachments/records`;

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    this.uploadProgress = Math.round((e.loaded / e.total) * 100);
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
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.message || `Server error: ${xhr.status}`));
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

        this.uploadProgress = 100;
        this.projectResearchAttachments = [...this.projectResearchAttachments, record];
        this.showNotification('Attachment uploaded.', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to upload attachment', 'error');
    } finally {
        this.uploadProgress = 0;
        this.hideLoading();
    }
    event.target.value = '';
}

export function getProjectResearchAttachmentUrl(attachment) {
    const filename = attachment.file?.filename ?? attachment.file ?? attachment.name;
    if (!filename) return null;
    return `${pb.baseUrl}/api/files/project_attachments/${attachment.id}/${filename}`;
}

export async function deleteProjectResearchAttachment(attachmentId) {
    try {
        await pb.collection('project_attachments').delete(attachmentId);
        this.projectResearchAttachments = this.projectResearchAttachments.filter(a => a.id !== attachmentId);
    } catch (e) {
        this.showNotification(e.message || 'Failed to delete attachment', 'error');
    }
}

export async function addProjectResearchComment() {
    let html = this.projectResearchCommentEditor?.root?.innerHTML ?? this.projectResearchCommentContent ?? '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = (temp.textContent || temp.innerText || '').trim();
    if (!text || !this.projectResearchProject) return;
    const userId = pb.authStore.model?.id;
    if (!userId) {
        this.showNotification('You must be logged in to comment.', 'error');
        return;
    }
    try {
        const record = await pb.collection('project_comments').create({
            project: this.projectResearchProject.id,
            user: userId,
            content: html
        }, { requestKey: null });
        const withExpand = { ...record, expand: { user: pb.authStore.model } };
        this.projectResearchComments = [...this.projectResearchComments, withExpand];
        if (this.projectResearchCommentEditor) {
            this.projectResearchCommentEditor.root.innerHTML = '';
        }
        this.projectResearchCommentContent = '';
    } catch (e) {
        this.showNotification(e.message || 'Failed to add comment', 'error');
    }
}

export async function deleteProjectResearchComment(commentId) {
    try {
        await pb.collection('project_comments').delete(commentId);
        this.projectResearchComments = this.projectResearchComments.filter(c => c.id !== commentId);
        if (this.projectResearchEditingCommentId === commentId) {
            this.projectResearchEditingCommentId = null;
            this.projectResearchCommentEditEditor = null;
        }
    } catch (e) {
        this.showNotification(e.message || 'Failed to delete comment', 'error');
    }
}

export function startEditProjectResearchComment(comment) {
    this.projectResearchEditingCommentId = comment.id;
    this.$nextTick(() => {
        const sel = '#project-research-comment-edit-' + comment.id;
        const el = document.querySelector(sel);
        if (!el) return;
        if (this.projectResearchCommentEditEditor) {
            this.projectResearchCommentEditEditor = null;
        }
        this.projectResearchCommentEditEditor = new Quill(sel, {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    ['link'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['clean']
                ]
            },
            placeholder: 'Edit comment...'
        });
        this.projectResearchCommentEditEditor.root.innerHTML = comment.content || '';
    });
}

export function cancelProjectResearchCommentEdit() {
    this.projectResearchEditingCommentId = null;
    this.projectResearchCommentEditEditor = null;
}

export async function saveProjectResearchCommentEdit(commentId) {
    if (!this.projectResearchCommentEditEditor) return;
    const html = this.projectResearchCommentEditEditor.root.innerHTML;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = (temp.textContent || temp.innerText || '').trim();
    if (!text) {
        this.showNotification('Comment cannot be empty.', 'error');
        return;
    }
    try {
        await this.updateProjectResearchComment(commentId, html);
        this.showNotification('Comment updated.', 'success');
    } catch (e) {
        this.showNotification(e.message || 'Failed to update comment', 'error');
        return;
    }
    this.projectResearchEditingCommentId = null;
    this.projectResearchCommentEditEditor = null;
}

export async function updateProjectResearchComment(commentId, content) {
    await pb.collection('project_comments').update(commentId, { content }, { requestKey: null });
    const idx = this.projectResearchComments.findIndex(c => c.id === commentId);
    if (idx !== -1) {
        this.projectResearchComments = this.projectResearchComments.slice();
        this.projectResearchComments[idx] = { ...this.projectResearchComments[idx], content };
    }
}
