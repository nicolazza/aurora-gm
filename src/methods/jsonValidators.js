/**
 * Safe JSON parsing utilities for GM app.
 * All functions return safe defaults on malformed data and log issues.
 */

import { captureWarning } from './errorLogger.js'

/**
 * Safely parse a value that might be a JSON string or already an object.
 * Returns `fallback` on parse error and logs a warning.
 */
export function safeParseJSON(value, fallback, context) {
    if (value === null || value === undefined || value === '') return fallback
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch {
        if (context) {
            captureWarning(
                `Malformed JSON in ${context}: ${String(value).slice(0, 200)}`,
                'jsonValidation',
            )
        }
        return fallback
    }
}

/** Parse monetaryCosts / verifiedMonetaryCosts: expected {costTypeId: amount} */
export function parseMonetaryCosts(value, context) {
    const parsed = safeParseJSON(value, {}, context)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        if (context) captureWarning(`monetaryCosts is not an object in ${context}`, 'jsonValidation')
        return {}
    }
    return parsed
}

/** Parse theme settings */
export function parseTheme(value, defaults = {}) {
    const parsed = safeParseJSON(value, {}, 'settings.theme')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults
    return { ...defaults, ...parsed }
}

/** Parse coordinates: expected {lat, lng} or null */
export function parseCoordinates(value) {
    if (!value) return null
    const parsed = safeParseJSON(value, {}, 'coordinates')
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') {
        return null
    }
    return { lat: parsed.lat, lng: parsed.lng }
}

/** Parse categories: expected string[] */
export function parseCategories(value, context) {
    if (!value) return []
    const parsed = safeParseJSON(value, [], context)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => typeof item === 'string')
}

/** Parse communityLabor: expected {people, hours, rate, totalValue} */
export function parseCommunityLabor(value, context) {
    if (!value) return { people: 0, hours: 0, rate: 0, totalValue: 0 }
    const parsed = safeParseJSON(value, {}, context)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { people: 0, hours: 0, rate: 0, totalValue: 0 }
    }
    return parsed
}

/** Parse inKindDetails */
export function parseInKindDetails(value, context) {
    if (!value) return {}
    return safeParseJSON(value, {}, context)
}

/** Sum values in a monetaryCosts-style object */
export function sumCosts(costs) {
    if (!costs || typeof costs !== 'object') return 0
    return Object.values(costs).reduce((sum, v) => sum + (Number(v) || 0), 0)
}
