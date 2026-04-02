/**
 * User management (Settings): list, create, edit, delete users.
 * Uses pb.collection('users') with username, password, role (schema: auth, minPasswordLength 8).
 */
import { pb } from '../config.js'

export async function fetchUsers() {
    if (!this.isAdmin) return;
    try {
        this.usersList = await pb.collection('users').getFullList({ sort: '-created' });
    } catch (e) {
        console.error('Error fetching users:', e);
        this.showNotification('Could not load users: ' + (e.message || 'Unknown error'), 'error');
        this.usersList = [];
    }
}

export function openCreateUser() {
    this.userForm = { username: '', password: '', passwordConfirm: '', role: 'staff' };
    this.userFormId = null;
    this.userModalMode = 'create';
    this.showUserModal = true;
}

export function openEditUser(user) {
    this.userForm = {
        username: user.username ?? '',
        password: '',
        passwordConfirm: '',
        role: user.role ?? 'staff'
    };
    this.userFormId = user.id;
    this.userModalMode = 'edit';
    this.showUserModal = true;
}

export function closeUserModal() {
    this.showUserModal = false;
    this.userFormId = null;
    this.userForm = { username: '', password: '', passwordConfirm: '', role: 'staff' };
}

export async function saveUser() {
    const { username, password, passwordConfirm, role } = this.userForm;
    const un = (username || '').trim();
    if (!un) {
        this.showNotification('Username is required.', 'error');
        return;
    }
    if (this.userModalMode === 'create') {
        if (!password || password.length < 8) {
            this.showNotification('Password must be at least 8 characters.', 'error');
            return;
        }
        if (password !== passwordConfirm) {
            this.showNotification('Password and confirmation do not match.', 'error');
            return;
        }
        try {
            this.showLoading('Creating user...');
            await pb.collection('users').create({
                username: un,
                password,
                passwordConfirm,
                role: role || 'staff'
            });
            await this.fetchUsers();
            this.closeUserModal();
            this.hideLoading();
            this.showNotification('User created.', 'success');
        } catch (e) {
            this.hideLoading();
            this.showNotification('Error creating user: ' + (e.message || 'Unknown error'), 'error');
        }
        return;
    }
    // Edit
    const payload = { username: un, role: role || 'staff' };
    if (password && password.trim()) {
        if (password.length < 8) {
            this.showNotification('Password must be at least 8 characters.', 'error');
            return;
        }
        if (password !== passwordConfirm) {
            this.showNotification('Password and confirmation do not match.', 'error');
            return;
        }
        payload.password = password;
        payload.passwordConfirm = passwordConfirm;
    }
    try {
        this.showLoading('Saving user...');
        await pb.collection('users').update(this.userFormId, payload);
        await this.fetchUsers();
        this.closeUserModal();
        this.hideLoading();
        this.showNotification('User updated.', 'success');
    } catch (e) {
        this.hideLoading();
        this.showNotification('Error updating user: ' + (e.message || 'Unknown error'), 'error');
    }
}

export async function deleteUser(user) {
    if (user.id === this.currentUser?.id) {
        this.showNotification('You cannot delete your own account.', 'error');
        return;
    }
    this.showConfirm(
        `Delete user "${user.username}"? They will no longer be able to log in.`,
        async () => {
            try {
                this.showLoading('Deleting user...');
                await pb.collection('users').delete(user.id);
                await this.fetchUsers();
                this.hideLoading();
                this.showNotification('User deleted.', 'success');
            } catch (e) {
                this.hideLoading();
                this.showNotification('Error deleting user: ' + (e.message || 'Unknown error'), 'error');
            }
        }
    );
}
