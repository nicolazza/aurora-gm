/**
 * Authentication & 2FA Methods
 * ~280 lines
 */
import { pb } from '../config.js'

export function openPublicSim() {
    // Navigate to public simulation view or home
    this.currentView = 'home';
}

// ========== AUTHENTICATION METHODS ==========
export async function handleLogin() {
    try {
        this.loginError = '';
        this.showLoading('Logging in...');
        
        // First, authenticate with email/password
        const authData = await pb.collection('users').authWithPassword(this.loginUsername, this.loginPassword);
        
        // Check if 2FA is required
        const user = authData.record;
        const needs2FASetup = !user.twoFactorSecret && !user.twoFactorEnabled;
        const needs2FACode = user.twoFactorEnabled && user.twoFactorSecret;
        
        if (needs2FASetup) {
            // Force 2FA setup on first login
            this.hideLoading();
            pb.authStore.clear(); // Clear auth until 2FA is set up
            this.showLoginModal = false;
            this.showNotification('2FA setup required. Please set up Two-Factor Authentication.', 'info');
            await this.start2FASetup();
            return;
        }
        
        if (needs2FACode) {
            // 2FA is enabled - require code
            this.hideLoading();
            this.requires2FA = true;
            // Keep auth data temporarily (will be cleared if 2FA fails)
            this.tempAuthData = authData;
            return;
        }
        
        // No 2FA required - complete login
        await this.completeLogin(authData);
    } catch (error) {
        this.loginError = error.message || 'Invalid username or password';
        this.hideLoading();
        console.error('Login error:', error);
    }
}

export async function handle2FALogin() {
    if (!this.twoFactorCode || this.twoFactorCode.length !== 6) {
        this.loginError = 'Please enter a 6-digit code';
        return;
    }
    
    try {
        this.loginError = '';
        this.showLoading('Verifying 2FA code...');
        
        if (!this.tempAuthData) {
            throw new Error('Authentication required');
        }
        
        // Re-authenticate with 2FA code as query parameter
        // The PocketBase hook will validate it server-side
        const baseUrl = pb.baseUrl;
        const authResponse = await fetch(`${baseUrl}/api/collections/users/auth-with-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                identity: this.loginUsername,
                password: this.loginPassword,
                twoFactorCode: this.twoFactorCode
            })
        });
        
        if (!authResponse.ok) {
            const errorData = await authResponse.json().catch(() => ({}));
            throw new Error(errorData.message || `Authentication failed: ${authResponse.status}`);
        }
        
        const authData = await authResponse.json();
        
        // Save auth token
        pb.authStore.save(authData.token, authData.record);
        
        // Complete login
        await this.completeLogin(authData);
    } catch (error) {
        this.loginError = error.message || 'Invalid 2FA code';
        this.hideLoading();
        // Clear temp auth on failure
        if (this.tempAuthData) {
            pb.authStore.clear();
            this.tempAuthData = null;
        }
        console.error('2FA login error:', error);
    }
}

export async function completeLogin(authData) {
    // Add a small delay for smooth transition
    await new Promise(resolve => setTimeout(resolve, 300));
    
    this.isAuthenticated = true;
    this.currentUser = authData.record;
    this.userRole = authData.record.role || 'admin';
    this.userPermissions = authData.record.permissions || {};

    if (authData.record.active === false) {
        pb.authStore.clear();
        this.isAuthenticated = false;
        this.currentUser = null;
        this.userRole = 'guest';
        this.userPermissions = {};
        this.hideLoading();
        this.loginError = 'Your account has been deactivated. Contact an administrator.';
        return;
    }

    if (authData.record.must_change_password) {
        this.showNotification('Please change your password in Project Management (PM) Settings.', 'info');
    }

    this.showLoginModal = false;
    this.requires2FA = false;
    this.twoFactorCode = '';
    this.loginUsername = '';
    this.loginPassword = '';
    this.tempAuthData = null;
    this.hideLoading();
    this.showNotification('Logged in successfully!', 'success');
    const name = (authData.record?.name && String(authData.record.name).trim()) || (authData.record?.username && String(authData.record.username).trim()) || authData.record?.email || 'User';
    this.logAction(`${name} logged in`);

    // Fetch all data now that user is authenticated
    await this.fetchAllData();
}

export function cancelLogin() {
    if (this.requires2FA) {
        this.requires2FA = false;
        this.twoFactorCode = '';
        if (this.tempAuthData) {
            pb.authStore.clear();
            this.tempAuthData = null;
        }
    } else {
        this.showLoginModal = false;
        this.loginUsername = '';
        this.loginPassword = '';
        this.loginError = '';
    }
}

export function logout() {
    const name = (this.currentUser?.name && String(this.currentUser.name).trim()) || (this.currentUser?.username && String(this.currentUser.username).trim()) || this.currentUser?.email || 'User';
    this.logAction(`${name} logged out`);
    this.showLoading('Logging out...');
    
    // Add a small delay for smooth transition
    setTimeout(() => {
        pb.authStore.clear();
        this.isAuthenticated = false;
        this.currentUser = null;
        this.userRole = 'guest';
        this.requires2FA = false;
        this.twoFactorCode = '';
        this.hideLoading();
        this.showNotification('Logged out successfully', 'info');
    }, 300);
}

// ========== 2FA SETUP METHODS ==========
export async function start2FASetup() {
    try {
        // First authenticate to get user record
        const authData = await pb.collection('users').authWithPassword(this.loginUsername, this.loginPassword);
        this.tempAuthData = authData;
        
        // Generate TOTP secret
        const secret = window.TOTP.generateSecret();
        
        // Create service name and account name for QR code
        const serviceName = 'NGO Manager';
        const accountName = authData.record.username || authData.record.email || authData.record.id;
        const otpauth = window.TOTP.keyuri(accountName, serviceName, secret);
        
        // Generate QR code using QR code API or library
        if (typeof QRCode !== 'undefined') {
            // Use QRCode library if available
            const canvas = document.createElement('canvas');
            await QRCode.toCanvas(canvas, otpauth, { width: 200 });
            this.twoFactorQRCode = canvas.outerHTML;
        } else {
            // Fallback to API
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
            this.twoFactorQRCode = `<img src="${qrCodeUrl}" alt="QR Code" class="mx-auto border-2 border-gray-300 rounded">`;
        }
        
        this.twoFactorSecret = secret;
        this.show2FASetupModal = true;
    } catch (error) {
        this.showNotification('Error starting 2FA setup: ' + error.message, 'error');
        console.error('2FA setup error:', error);
    }
}

export async function verifyAndEnable2FA() {
    if (!this.twoFactorVerificationCode || this.twoFactorVerificationCode.length !== 6) {
        this.showNotification('Please enter a 6-digit verification code', 'error');
        return;
    }
    
    try {
        this.showLoading('Verifying and enabling 2FA...');
        
        // Verify the code using TOTP
        const isValid = await window.TOTP.verify(this.twoFactorVerificationCode, this.twoFactorSecret);
        
        if (!isValid) {
            this.hideLoading();
            this.showNotification('Invalid code. Please try again.', 'error');
            return;
        }
        
        // Generate backup codes (10 codes, 8 characters each)
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            backupCodes.push(code);
        }
        
        // Hash backup codes before storing (simple hash for now - in production use proper hashing)
        const hashedBackupCodes = backupCodes.map(code => {
            // Simple hash - in production, use proper crypto
            return btoa(code).split('').reverse().join('');
        });
        
        // Update user record with 2FA settings
        if (!this.tempAuthData) {
            throw new Error('Authentication required');
        }
        
        const userId = this.tempAuthData.record.id;
        await pb.collection('users').update(userId, {
            twoFactorEnabled: true,
            twoFactorSecret: this.twoFactorSecret,
            twoFactorBackupCodes: JSON.stringify(hashedBackupCodes)
        });
        
        // Store plain backup codes for display (they won't be saved)
        this.twoFactorBackupCodes = backupCodes;
        this.twoFactorVerificationCode = '';
        
        this.hideLoading();
        this.showNotification('2FA enabled successfully!', 'success');
    } catch (error) {
        this.hideLoading();
        this.showNotification('Error enabling 2FA: ' + error.message, 'error');
        console.error('2FA enable error:', error);
    }
}

export function close2FASetup() {
    this.show2FASetupModal = false;
    this.twoFactorSecret = null;
    this.twoFactorQRCode = null;
    this.twoFactorBackupCodes = [];
    this.twoFactorVerificationCode = '';
    
    // Complete login after 2FA setup
    if (this.tempAuthData) {
        this.completeLogin(this.tempAuthData);
        this.tempAuthData = null;
    }
}

export function cancel2FASetup() {
    this.show2FASetupModal = false;
    this.twoFactorSecret = null;
    this.twoFactorQRCode = null;
    this.twoFactorBackupCodes = [];
    this.twoFactorVerificationCode = '';
    
    if (this.tempAuthData) {
        pb.authStore.clear();
        this.tempAuthData = null;
    }
    
    this.showLoginModal = true;
}

export function copyBackupCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        this.showNotification('Backup code copied!', 'success');
    });
}

export function copyAllBackupCodes() {
    const codesText = this.twoFactorBackupCodes.join('\n');
    navigator.clipboard.writeText(codesText).then(() => {
        this.showNotification('All backup codes copied!', 'success');
    });
}
