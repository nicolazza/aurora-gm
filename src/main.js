/**
 * NGO Farm Manager - Main Entry Point
 * Assembles all modules into the Vue app
 */

/* global __BUILD_COMMIT__, __BUILD_DATE__ */
window.__BUILD__ = { app: 'GM', commit: __BUILD_COMMIT__, date: __BUILD_DATE__ }

import { createApp } from 'vue'
import i18n from './i18n/index.js'
import { pb } from './config.js'
import { data } from './data.js'
import { computed } from './computed/index.js'
import { watch } from './watch.js'
import { mounted, beforeUnmount } from './lifecycle.js'

// Import all method modules
import * as authMethods from './methods/auth.js'
import * as fetchMethods from './methods/fetch.js'
import * as projectMethods from './methods/projects.js'
import * as grantMethods from './methods/grants.js'
import * as walletMethods from './methods/wallets.js'
import * as categoryMethods from './methods/categories.js'
import * as usersMethods from './methods/users.js'
import * as scholarshipMethods from './methods/scholarships.js'
import * as mapMethods from './methods/maps.js'
import * as utilityMethods from './methods/utility.js'
import * as completionMethods from './methods/completion.js'
import * as galleryMethods from './methods/gallery.js'
import * as uiMethods from './methods/ui.js'
import * as scoringMethods from './methods/scoring.js'
import * as researchMethods from './methods/research.js'
import * as errorLoggerMethods from './methods/errorLogger.js'
import * as aiChatMethods from './methods/aiChat.js'
import * as donorMethods from './methods/donors.js'
import riskGuideContent from './RISK_AND_SCORING_EXPLAINED.md?raw'

// Combine all methods into one object
const methods = {
    ...authMethods,
    ...fetchMethods,
    ...projectMethods,
    ...researchMethods,
    ...grantMethods,
    ...walletMethods,
    ...categoryMethods,
    ...usersMethods,
    ...scholarshipMethods,
    ...mapMethods,
    ...utilityMethods,
    ...completionMethods,
    ...galleryMethods,
    ...uiMethods,
    ...scoringMethods,
    ...errorLoggerMethods,
    ...aiChatMethods,
    ...donorMethods,
    getRiskGuideContent: () => riskGuideContent
}

// Vue app configuration
const config = {
    data,
    computed,
    watch,
    mounted,
    beforeUnmount,
    methods
}

// Create and mount the app
const app = createApp(config)
app.use(i18n)

// Global Vue error handler — catches errors in component renders, watchers, lifecycle hooks
app.config.errorHandler = (err, instance, info) => {
    errorLoggerMethods.captureError(err, `Vue.${info}`, {
        context: { component: instance?.$options?.name || 'unknown' },
    })
}

window.vueApp = app.mount('#app')

// Show body after Vue is ready
window.vueApp.$nextTick(() => {
    document.body.classList.add('vue-ready')
})

// Setup global error handlers (uncaught exceptions + unhandled rejections)
errorLoggerMethods.setupGlobalErrorHandlers()

console.log('NGO Farm Manager - Modular Vite Version Loaded')
