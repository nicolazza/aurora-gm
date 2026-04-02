/**
 * Error Logger for GM — writes to PB `error_logs` collection.
 * Also shows user-facing alerts for critical failures.
 * Never throws — if logging fails, falls back to console only.
 */

import { pb } from '../config.js'

const APP_NAME = 'GM'
const ERROR_LOGS_COLLECTION = 'error_logs'

// Dedup: suppress identical errors within 10 seconds
const recentErrors = new Map()
const DEDUP_WINDOW_MS = 10000

function fingerprint(message, stack) {
    return `${message}::${(stack || '').slice(0, 100)}`
}

function isDuplicate(fp) {
    const last = recentErrors.get(fp)
    if (last && Date.now() - last < DEDUP_WINDOW_MS) return true
    recentErrors.set(fp, Date.now())
    if (recentErrors.size > 50) {
        const cutoff = Date.now() - DEDUP_WINDOW_MS
        for (const [key, ts] of recentErrors) {
            if (ts < cutoff) recentErrors.delete(key)
        }
    }
    return false
}

/**
 * Capture and log an error.
 * @param {unknown} error - The error object or message
 * @param {string} action - What was being attempted (e.g. 'confirmStartProject')
 * @param {object} [options]
 * @param {'error'|'warning'|'info'} [options.level='error']
 * @param {object} [options.context={}] - Extra context data
 * @param {boolean} [options.showAlert] - Show browser alert to user (default: true for errors)
 * @param {string} [options.alertMessage] - Custom alert text
 */
export async function captureError(error, action, options = {}) {
    const { level = 'error', context = {}, showAlert, alertMessage } = options

    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? (error.stack || '') : ''

    // Console output (always)
    console.error(`[${APP_NAME}] ${action}:`, error)

    // Show alert to user for errors
    const shouldAlert = showAlert ?? (level === 'error')
    if (shouldAlert) {
        // Use a non-blocking approach: banner at top of page
        showErrorBanner(alertMessage || `${action}: ${message}`)
    }

    // Deduplicate
    const fp = fingerprint(message, stack)
    if (isDuplicate(fp)) return

    // Write to PB (fire-and-forget)
    try {
        const userId = pb.authStore.model?.id || ''
        await pb.collection(ERROR_LOGS_COLLECTION).create({
            app: APP_NAME,
            level,
            message: `[${action}] ${message}`.slice(0, 5000),
            stack: stack.slice(0, 10000),
            context: {
                ...context,
                url: window.location.href,
                timestamp: new Date().toISOString(),
            },
            user: userId || undefined,
        }, { requestKey: null })
    } catch {
        console.warn('[ErrorLogger] Failed to write to error_logs collection')
    }
}

/**
 * Capture a warning (no user alert by default).
 */
export async function captureWarning(message, action, context) {
    return captureError(new Error(message), action, { level: 'warning', showAlert: false, context })
}

/**
 * Show a dismissible error banner at the top of the page.
 */
function showErrorBanner(text) {
    // Don't stack more than 3 banners
    const existing = document.querySelectorAll('.error-banner')
    if (existing.length >= 3) existing[0].remove()

    const banner = document.createElement('div')
    banner.className = 'error-banner'
    banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        background: #991b1b; color: #fecaca; padding: 10px 16px;
        font-size: 13px; display: flex; align-items: center; gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: slideDown 0.25s ease-out;
    `
    banner.innerHTML = `
        <span style="flex:1">${text}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:18px;padding:0 4px">&times;</button>
    `
    document.body.prepend(banner)

    // Auto-dismiss after 8 seconds
    setTimeout(() => banner.remove(), 8000)
}

/**
 * Setup global error handlers (call once at app startup).
 */
export function setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
        captureError(event.error || event.message, 'window.onerror', {
            context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
        })
    })

    window.addEventListener('unhandledrejection', (event) => {
        // Ignore PocketBase SDK auto-cancellation (status 0) — these are benign
        // and happen when a newer request replaces a pending one to the same endpoint.
        if (event.reason && (event.reason.status === 0 || event.reason.isAbort)) return
        captureError(event.reason, 'unhandledrejection')
    })
}

// Add the slide-down animation
if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.textContent = `
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
    `
    document.head.appendChild(style)
}
