/**
 * PocketBase Configuration
 * ~20 lines
 */

import PocketBase from 'pocketbase'

// In browser use same origin so Vite proxy forwards to PocketBase (fixes iPhone / CORS)
// URL configured via VITE_PB_URL in .env / .env.local
const POCKETBASE_SERVER = import.meta.env.VITE_PB_URL || ''
export const POCKETBASE_URL = typeof window !== 'undefined' ? window.location.origin : POCKETBASE_SERVER
export const pb = new PocketBase(POCKETBASE_URL)

// Cache for collection IDs (used for file URLs)
export let collectionIdCache = {}

export const DEFAULT_THEME = {
    headerBg: '#6b21a8',
    headerHover: '#581c87',
    settingsIcon: '#d8b4fe',
    primaryBtn: '#6b21a8',
    colorMonetary: '#16a34a',
    colorInkind: '#2563eb',
    colorCommunity: '#ea580c',
    colorAllocation: '#7c3aed',
    colorProjectValue: '#D69828',
    colorBarCompleted: '#D69828',
    colorBarInProgress: '#F5DFA8',
    colorTierCompleted: '#D69828',
    colorTierInProgress: '#F5DFA8'
}

// ========== NEW SCORING SYSTEM ==========
// Lookup tables for the step scoring algorithm
export const SCORE_TABLES = {
    // Urgency weight U(u) - non-linear, 1-10
    U: { 1: 0.5, 2: 0.8, 3: 1.2, 4: 1.7, 5: 2.3, 6: 3.1, 7: 4.1, 8: 5.4, 9: 7.0, 10: 9.0 },
    // Breadth weight B(b) - how many benefit, 1-5
    B: { 1: 1.0, 2: 1.6, 3: 2.5, 4: 4.0, 5: 6.3 },
    // Depth weight D(d) - benefit intensity, 1-5
    D: { 1: 0.8, 2: 1.2, 3: 1.8, 4: 2.7, 5: 4.0 },
    // Neglectedness multiplier N(n) - 1-5
    N: { 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3 },
    // Momentum multiplier M(step) - step 1, 2, 3+
    M: { 1: 1.0, 2: 1.1, 3: 1.2 }
};

// Urgency definitions (u) - 1 to 10
export const URGENCY_DEFS = [
    { val: 10, label: 'Immediate safety / life-critical', ex: 'Clinic/hospital without power; no potable water; imminent fire risk.' },
    { val: 9, label: 'Critical window', ex: 'Water system about to fail; time-sensitive medicine logistics; bridge washed out.' },
    { val: 8, label: 'Near-critical', ex: 'Major harm if delayed days; key equipment failing.' },
    { val: 7, label: 'Major harm if ignored', ex: 'School cannot run program; recurring outages; key equipment broken.' },
    { val: 6, label: 'Hits services/operations', ex: 'Important operational issue affecting daily work.' },
    { val: 5, label: 'Serious but manageable', ex: 'Clear problem but can work around temporarily.' },
    { val: 4, label: 'Real friction/inefficiency', ex: 'Slows down work but not blocking.' },
    { val: 3, label: 'Useful but delayable', ex: 'Would help but not urgent.' },
    { val: 2, label: 'Minor improvement', ex: 'Small efficiency gain.' },
    { val: 1, label: 'Nice-to-have', ex: 'Aesthetics, comfort upgrades, optional features.' }
];

// Breadth definitions (b) - 1 to 5
export const BREADTH_DEFS = [
    { val: 1, label: '1 person', ex: 'Individual beneficiary' },
    { val: 2, label: '2-10 people', ex: 'Family or small team' },
    { val: 3, label: '10-50 people', ex: 'Group or class' },
    { val: 4, label: '50-500 people', ex: 'Community' },
    { val: 5, label: '500+ people', ex: 'Region or large population' }
];

// Depth definitions (d) - 1 to 5
export const DEPTH_DEFS = [
    { val: 1, label: 'Nice-to-have', ex: 'Minor convenience' },
    { val: 2, label: 'Small QoL improvement', ex: 'Noticeable but small benefit' },
    { val: 3, label: 'Clear material benefit', ex: 'Meaningful improvement' },
    { val: 4, label: 'Transformative', ex: 'Significant life improvement' },
    { val: 5, label: 'Safety / life-changing', ex: 'Critical for wellbeing' }
];

// Neglectedness definitions (n) - 1 to 5
export const NEGLECTEDNESS_DEFS = [
    { val: 1, label: 'Already covered', ex: 'Government/large NGO paying; beneficiary can easily pay.' },
    { val: 2, label: 'Likely covered', ex: 'Private benefit with realistic alternatives.' },
    { val: 3, label: 'Neutral', ex: 'No strong evidence either way.' },
    { val: 4, label: 'Underfunded', ex: 'Some help exists but gaps remain.' },
    { val: 5, label: 'Highly neglected', ex: 'No one else will do it; marginal dollar very valuable.' }
];

// Confidence definitions (k) - 0.6 to 1.0
export const CONFIDENCE_DEFS = [
    { val: 1.00, label: 'Near-certain', ex: 'Routine task, known vendor, known fix.' },
    { val: 0.90, label: 'Very likely', ex: 'Simple procurement + install; minor logistics uncertainty.' },
    { val: 0.80, label: 'Some risk', ex: 'New technical complexity; multi-person coordination.' },
    { val: 0.70, label: 'High variance', ex: 'Uncertain root cause; challenging access.' },
    { val: 0.60, label: 'Very uncertain', ex: 'Many unknowns or dependencies.' }
];
