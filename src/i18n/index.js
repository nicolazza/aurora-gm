/**
 * i18n Configuration for GM
 * Uses vue-i18n with lazy-loaded locale messages.
 */

import { createI18n } from 'vue-i18n'
import en from './en.json'
import es from './es.json'

const savedLocale = localStorage.getItem('gm-locale') || 'en'

const i18n = createI18n({
    legacy: true, // Options API mode
    locale: savedLocale,
    fallbackLocale: 'en',
    messages: { en, es },
})

export default i18n
