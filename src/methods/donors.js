import { pb } from '../config.js'

export async function fetchDonors() {
    try {
        const records = await pb.collection('gm_donors').getFullList({ sort: 'name', requestKey: null })
        this.donors = records.map(r => ({
            id: r.id,
            name: r.name || '',
            contact: r.contact || '',
            notes: r.notes || '',
            created: r.created,
        }))
    } catch (e) {
        console.error('Failed to fetch donors:', e)
    }
}

export async function createDonor(name, contact = '', notes = '') {
    try {
        const record = await pb.collection('gm_donors').create({
            name: name.trim(),
            contact: contact.trim(),
            notes: notes.trim(),
        }, { requestKey: null })
        const donor = {
            id: record.id,
            name: record.name || '',
            contact: record.contact || '',
            notes: record.notes || '',
            created: record.created,
        }
        this.donors.push(donor)
        this.donors.sort((a, b) => a.name.localeCompare(b.name))
        return donor
    } catch (e) {
        console.error('Failed to create donor:', e)
        this.showNotification('Failed to create donor', 'error')
        return null
    }
}

export async function updateDonor(id, changes) {
    try {
        const data = {}
        if (changes.name !== undefined) data.name = changes.name.trim()
        if (changes.contact !== undefined) data.contact = changes.contact.trim()
        if (changes.notes !== undefined) data.notes = changes.notes.trim()
        await pb.collection('gm_donors').update(id, data, { requestKey: null })
        const idx = this.donors.findIndex(d => d.id === id)
        if (idx >= 0) {
            Object.assign(this.donors[idx], data)
            this.donors.sort((a, b) => a.name.localeCompare(b.name))
        }
    } catch (e) {
        console.error('Failed to update donor:', e)
        this.showNotification('Failed to update donor', 'error')
    }
}

export async function deleteDonor(id) {
    const donorName = this.donors.find(d => d.id === id)?.name || '?'
    const refs = this.getDonorProjectRefs(id)
    const laborRefs = (this.donorLaborLogs || []).filter(l => l.donorId === id)
    const totalRefs = refs.length + laborRefs.length
    if (totalRefs > 0) {
        this.showNotification(`Cannot delete "${donorName}" — referenced in ${totalRefs} contribution(s)`, 'error')
        return
    }
    try {
        await pb.collection('gm_donors').delete(id, { requestKey: null })
        this.donors = this.donors.filter(d => d.id !== id)
        this.showNotification(`Donor "${donorName}" deleted`, 'success')
    } catch (e) {
        console.error('Failed to delete donor:', e)
        this.showNotification('Failed to delete donor', 'error')
    }
}

export function getDonorProjectRefs(donorId) {
    const refs = []
    for (const proj of this.projects) {
        for (const tier of (proj.tiers || [])) {
            const donations = tier.donations || []
            for (const d of donations) {
                if (d.donorId === donorId) {
                    refs.push({
                        projectId: proj.id,
                        projectTitle: proj.title,
                        tierLevel: tier.level,
                        stepCode: tier.step_code,
                        description: d.description,
                        value: d.value,
                        type: d.type,
                    })
                }
            }
        }
    }
    return refs
}

export function addDonationToTier(tierIndex) {
    if (!this.newDonationDonorId || !this.newDonationDescription.trim() || !this.newDonationValue) return
    const donor = this.donors.find(d => d.id === this.newDonationDonorId)
    if (!donor) return
    const tier = this.modalProject.tiers[tierIndex]
    if (!tier.donations) tier.donations = []
    tier.donations.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        donorId: donor.id,
        donorName: donor.name,
        description: this.newDonationDescription.trim(),
        type: this.newDonationType,
        value: this.newDonationValue,
        isEstimate: true,
    })
    this.newDonationDonorId = ''
    this.newDonationDescription = ''
    this.newDonationType = 'cash'
    this.newDonationValue = 0
}

export function addDonationToStartProject() {
    if (!this.newDonationDonorId || !this.newDonationDescription.trim() || !this.newDonationValue) return
    const donor = this.donors.find(d => d.id === this.newDonationDonorId)
    if (!donor || !this.startProjectData) return
    if (!this.startProjectData.donations) this.startProjectData.donations = []
    this.startProjectData.donations.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        donorId: donor.id,
        donorName: donor.name,
        description: this.newDonationDescription.trim(),
        type: this.newDonationType,
        value: this.newDonationValue,
        isEstimate: true,
    })
    this.newDonationDonorId = ''
    this.newDonationDescription = ''
    this.newDonationType = 'cash'
    this.newDonationValue = 0
}

export function getDonorTotalDonated(donorId) {
    let total = 0
    for (const proj of this.projects) {
        for (const tier of (proj.tiers || [])) {
            for (const d of (tier.donations || [])) {
                if (d.donorId === donorId) total += (d.value || 0)
            }
        }
    }
    return total
}

/**
 * Fetch labor logs with donor relations for all donors.
 * Populates this.donorLaborLogs — array of { donorId, type, hours, rate, tierId, projectTitle, stepCode }
 */
function buildTierMap(projects) {
    const tierMap = {}
    for (const proj of projects) {
        for (const tier of (proj.tiers || [])) {
            tierMap[tier.id] = { projectId: proj.id, projectTitle: proj.title, stepCode: tier.step_code, level: tier.level }
        }
    }
    return tierMap
}

function mapLaborLog(l, tierMap) {
    return {
        id: l.id,
        donorId: l.donor,
        donorNote: l.donor_note || '',
        type: l.type,
        hours: l.hours || 0,
        people: l.people || 1,
        rate: l.rate || 0,
        value: (l.hours || 0) * (l.rate || 0) * (l.people || 1),
        tierId: l.tier,
        projectId: tierMap[l.tier]?.projectId || '',
        projectTitle: tierMap[l.tier]?.projectTitle || '',
        stepCode: tierMap[l.tier]?.stepCode || '',
        stepLevel: tierMap[l.tier]?.level || 0,
        date: l.date || l.created,
    }
}

export async function fetchDonorLaborLogs() {
    this.donorLaborLogsLoading = true
    try {
        const perPage = 50
        const result = await pb.collection('fm_labor_logs').getList(1, perPage, {
            filter: 'donor != ""',
            sort: '-created',
            requestKey: null,
        })
        const tierMap = buildTierMap(this.projects)
        this.donorLaborLogs = result.items.map(l => mapLaborLog(l, tierMap))
        this.donorLaborLogsPage = result.page
        this.donorLaborLogsTotalPages = result.totalPages
        this.donorLaborLogsTotalItems = result.totalItems
    } catch (e) {
        console.error('fetchDonorLaborLogs', e)
        this.donorLaborLogs = []
    }
    this.donorLaborLogsLoading = false
    this.donorLaborLogsFetched = true
}

export async function loadMoreDonorLaborLogs() {
    if (this.donorLaborLogsPage >= this.donorLaborLogsTotalPages || this.donorLaborLogsLoadingMore) return
    this.donorLaborLogsLoadingMore = true
    try {
        const nextPage = this.donorLaborLogsPage + 1
        const result = await pb.collection('fm_labor_logs').getList(nextPage, 50, {
            filter: 'donor != ""',
            sort: '-created',
            requestKey: null,
        })
        const tierMap = buildTierMap(this.projects)
        this.donorLaborLogs = this.donorLaborLogs.concat(result.items.map(l => mapLaborLog(l, tierMap)))
        this.donorLaborLogsPage = result.page
        this.donorLaborLogsTotalPages = result.totalPages
    } catch (e) {
        console.error('loadMoreDonorLaborLogs', e)
    }
    this.donorLaborLogsLoadingMore = false
}

/** Get aggregated totals for a donor by category: { inkind, community, donations }. Uses donorBreakdownMap when available (computed, cached). */
export function getDonorBreakdown(donorId) {
    const cached = this.donorBreakdownMap?.get(donorId)
    if (cached) return cached
    let inkind = 0, community = 0, donations = 0
    for (const log of (this.donorLaborLogs || [])) {
        if (log.donorId !== donorId) continue
        if (log.type === 'inkind') inkind += log.value
        else if (log.type === 'community') community += log.value
    }
    for (const proj of this.projects) {
        for (const tier of (proj.tiers || [])) {
            for (const d of (tier.donations || [])) {
                if (d.donorId === donorId) donations += (d.value || 0)
            }
        }
    }
    return { inkind, community, donations }
}

/** Count unique projects a donor contributed to for the active tab. */
export function getDonorProjectCount(donorId) {
    const tab = this.donorActiveTab || 'community'
    const seen = new Set()
    if (tab === 'inkind' || tab === 'community') {
        for (const log of (this.donorLaborLogs || [])) {
            if (log.donorId !== donorId || log.type !== tab) continue
            if (log.projectId) seen.add(log.projectId)
        }
    } else {
        for (const proj of (this.projects || [])) {
            for (const tier of (proj.tiers || [])) {
                for (const d of (tier.donations || [])) {
                    if (d.donorId !== donorId) continue
                    seen.add(proj.id)
                }
            }
        }
    }
    return seen.size
}

/** Get expanded contribution rows for a donor, coloured by active hero tab. */
export function getDonorContributions(donorId, activeTab) {
    const rows = []
    if (activeTab === 'inkind' || activeTab === 'all') {
        for (const log of (this.donorLaborLogs || [])) {
            if (log.donorId !== donorId || log.type !== 'inkind') continue
            rows.push({ ...log, category: 'inkind' })
        }
    }
    if (activeTab === 'community' || activeTab === 'all') {
        for (const log of (this.donorLaborLogs || [])) {
            if (log.donorId !== donorId || log.type !== 'community') continue
            rows.push({ ...log, category: 'community' })
        }
    }
    if (activeTab === 'donations' || activeTab === 'all') {
        for (const proj of this.projects) {
            for (const tier of (proj.tiers || [])) {
                for (const d of (tier.donations || [])) {
                    if (d.donorId !== donorId) continue
                    rows.push({
                        id: d.id,
                        category: 'donations',
                        type: d.type,
                        description: d.description,
                        value: d.value || 0,
                        projectTitle: proj.title,
                        stepCode: tier.step_code,
                        stepLevel: tier.level,
                    })
                }
            }
        }
    }
    return rows
}

/** Hero card totals across all donors: { inkind, community, donations }. Delegates to donorHeroTotals computed. */
export function getDonorHeroTotals() {
    return this.donorHeroTotals
}
