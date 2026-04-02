/**
 * Vue Computed Properties
 * ~1,400 lines
 */

export const computed = {
    communityStats() {
        // Our effort = in-kind hours; Community effort = community hours; Generated value = community labor value. All from completed tiers only. Support flat fields and communityLabor JSON.
        let ngoHours = 0;
        let ngoValue = 0;
        let commHours = 0;
        let commValue = 0;
        this.projects.forEach(p => {
            if (p.type === 'scholarship' || !p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'completed') return;
                const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0;
                const ih = t.verifiedInkindHours ?? t.inkindHours ?? 0;
                const ir = t.verifiedInkindRate ?? t.inkindRate ?? 0;
                ngoHours += ip * ih;
                ngoValue += ip * ih * ir;
                if (t.communityLabor) {
                    const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                    commHours += (cl.people || 0) * (cl.hours || 0);
                    commValue += (cl.totalValue || 0);
                } else {
                    const cp = t.verifiedCommunityPeople ?? t.communityPeople ?? 0;
                    const ch = t.verifiedCommunityHours ?? t.communityHours ?? 0;
                    const cr = t.verifiedCommunityRate ?? t.communityRate ?? 0;
                    commHours += cp * ch;
                    commValue += cp * ch * cr;
                }
            });
        });
        const totalHours = ngoHours + commHours || 1;
        const percentNGO = (ngoHours / totalHours) * 100;
        const percentComm = (commHours / totalHours) * 100;
        const communityShareOfTotal = totalHours > 0 ? commHours / totalHours : 0; // 0–1, for Leverage Performance (target 33%)
        const totalValue = ngoValue + commValue || 1;
        const percentNGOValue = (ngoValue / totalValue) * 100;
        const percentCommValue = (commValue / totalValue) * 100;
        return { ngoHours, ngoValue, commHours, commValue, percentNGO, percentComm, percentNGOValue, percentCommValue, communityShareOfTotal };
    },
    isAdmin() { 
        return this.isAuthenticated && this.userRole === 'admin'; 
    },
    /** Cost types to show when creating/editing tier monetary costs (FM-synced only). Full costTypes still used for resolving historical data. */
    costTypesForNewData() {
        const list = (this.costTypes || []).filter(ct => ct.visible_in_gm === true && ct.active !== false);
        return [...list].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    },
    isStaff() {
        return this.isAuthenticated && (this.userRole === 'staff' || this.userRole === 'admin');
    },
    canEditProjects() {
        return this.isStaff; // Staff and admin can edit projects
    },
    canEditScholarships() {
        return this.isAdmin; // Only admin can edit scholarships
    },
    expenseStats() {
        // Value + Cost Structure: monetary costs only of completed tiers, split by cost type (costTypes). No in-kind, community, scholarships.
        const costTypes = this.costTypes || [];
        const idToTotal = new Map();
        let unknownTotal = 0;
        this.projects.forEach(p => {
            if (p.type === 'scholarship') return;
            if (!p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'completed') return;
                const costs = t.verifiedMonetaryCosts ?? t.monetaryCosts;
                const obj = typeof costs === 'string' ? (JSON.parse(costs || '{}')) : (costs || {});
                Object.entries(obj).forEach(([costTypeId, amount]) => {
                    const val = Number(amount) || 0;
                    if (!val) return;
                    const ct = costTypes.find(c => c.id === costTypeId);
                    if (ct) {
                        idToTotal.set(costTypeId, (idToTotal.get(costTypeId) || 0) + val);
                    } else {
                        unknownTotal += val;
                    }
                });
            });
        });
        const total = [...idToTotal.values()].reduce((a, b) => a + b, 0) + unknownTotal;
        const result = [];
        const sorted = [...costTypes].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        sorted.forEach(ct => {
            const value = idToTotal.get(ct.id) || 0;
            if (value > 0) result.push({ name: this.getCostTypeName(ct.name), value, percent: total > 0 ? (value / total) * 100 : 0 });
        });
        if (unknownTotal > 0) result.push({ name: this.getCostTypeName('Unknown') || 'Unknown', value: unknownTotal, percent: total > 0 ? (unknownTotal / total) * 100 : 0 });
        return result;
    },
    baseBacklogList() {
        return this.projects.filter(p => {
            if (p.type === 'scholarship') return false;
            if (!p.tiers || p.tiers.length === 0) return true; // Projects without tiers are in backlog
            // A project is in backlog if ANY tier is NOT completed
            const isFullyCompleted = p.tiers.every(t => t.status === 'completed');
            return !isFullyCompleted;
        });
    },
    completedProjects() {
        return this.projects.filter(p => {
            if (p.type === 'scholarship') return true;
            if (!p.tiers || p.tiers.length === 0) return false;
            // A project is completed if ALL tiers have status 'completed' (proof is optional)
            return p.tiers.every(t => t.status === 'completed');
        });
    },
    activeProjects() {
        // Non-scholarship projects with at least one tier in_progress or completed
        return this.projects.filter(p => {
            if (p.type === 'scholarship') return false;
            if (!p.tiers || p.tiers.length === 0) return false;
            return p.tiers.some(t => t.status === 'in_progress' || t.status === 'completed');
        });
    },
    countStatsBacklog() {
        // Non-scholarship projects where no tier is in_progress or completed; projects with no tiers = backlog
        return this.projects.filter(p => {
            if (p.type === 'scholarship') return false;
            if (!p.tiers || p.tiers.length === 0) return true;
            return !p.tiers.some(t => t.status === 'in_progress' || t.status === 'completed');
        }).length;
    },
    countActive() { return this.activeProjects.length; },
    countCompleted() { return this.completedProjects.length; },
    totalDonated() {
        // Sum over completed tiers only: monetary (verifiedMonetaryCosts else monetaryCosts) + in-kind labor value; add scholarshipValue. No community labor.
        let sum = 0;
        this.projects.forEach(p => {
            if (p.type === 'scholarship') {
                sum += (p.scholarshipValue || p.value || 0);
                return;
            }
            if (!p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'completed') return;
                const monetary = (t.verifiedMonetaryCosts || t.monetaryCosts);
                const monetaryObj = typeof monetary === 'string' ? (JSON.parse(monetary || '{}')) : (monetary || {});
                sum += Object.values(monetaryObj).reduce((a, v) => a + (Number(v) || 0), 0);
                const inkindP = t.verifiedInkindPeople ?? t.inkindPeople ?? 0;
                const inkindH = t.verifiedInkindHours ?? t.inkindHours ?? 0;
                const inkindR = t.verifiedInkindRate ?? t.inkindRate ?? 0;
                sum += inkindP * inkindH * inkindR;
            });
        });
        return sum;
    },
    totalLiquidity() {
        // Use FM wallets (the source of truth for balances) with GM wallets as fallback
        const fmTotal = (this.fmGmWallets || []).reduce((s, w) => s + (Number(w.balance) || 0), 0);
        if (fmTotal > 0 || (this.fmGmWallets && this.fmGmWallets.length > 0)) return fmTotal;
        return this.wallets.reduce((s, w) => s + w.balance, 0);
    },
    budgetTotalLiquidity() {
        return (this.fmGmWallets || []).reduce((s, w) => s + (Number(w.balance) || 0), 0);
    },
    filteredBudgetFeed() {
        let list = this.budgetFeed || [];
        if (this.filterWallet !== 'all') {
            const wid = this.filterWallet;
            list = list.filter(tx => tx._isBudgetEvent || (tx.walletId && String(tx.walletId) === String(wid)));
        }
        if (this.filterType !== 'all') {
            if (this.filterType === 'allocation') {
                list = list.filter(tx => tx._isBudgetEvent && tx.event_type === 'allocation');
            } else if (this.filterType === 'project_completion') {
                list = list.filter(tx => tx._isBudgetEvent && tx.event_type === 'project_completion');
            } else {
                list = list.filter(tx => !tx._isBudgetEvent && tx.type === this.filterType);
            }
        }
        return list;
    },
    totalNeeded() {
        // Sum only over tiers with status backlog or in_progress: monetary costs (Object.values monetaryCosts) only
        let sum = 0;
        this.projects.forEach(p => {
            if (p.type === 'scholarship' || !p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'backlog' && t.status !== 'in_progress') return;
                const costs = t.monetaryCosts;
                const obj = typeof costs === 'string' ? (JSON.parse(costs || '{}')) : (costs || {});
                sum += Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0);
            });
        });
        return sum;
    },
    financialChartData() {
        const timeframe = this.chartTimeframe || 'month';
        const periodKey = (date) => {
            const d = new Date(date);
            return timeframe === 'year' ? d.getFullYear().toString() : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        const periodSet = new Set();
        // Deposits: from transaction dates
        this.transactions.forEach(t => {
            if (t.type === 'DEPOSIT' || t.type === 'DONATION') periodSet.add(periodKey(t.date));
        });
        // Cash/In-Kind: from tier completion dates
        this.projects.forEach(p => {
            if (p.type === 'scholarship') {
                periodSet.add(periodKey(p.created));
                return;
            }
            if (!p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'completed') return;
                const date = t.completedAt || p.created;
                if (date) periodSet.add(periodKey(date));
            });
        });
        const periods = Array.from(periodSet).sort((a, b) => a.localeCompare(b));
        const dataPoints = periods.map(date => {
            let deposit = 0;
            this.transactions.forEach(t => {
                if ((t.type === 'DEPOSIT' || t.type === 'DONATION') && periodKey(t.date) === date)
                    deposit += Number(t.amount) || 0;
            });
            let cashGrant = 0;
            let inKindGrant = 0;
            this.projects.forEach(p => {
                if (p.type === 'scholarship') {
                    if (periodKey(p.created) === date) inKindGrant += (p.scholarshipValue ?? p.value ?? 0);
                    return;
                }
                if (!p.tiers) return;
                p.tiers.forEach(t => {
                    if (t.status !== 'completed') return;
                    const tierDate = t.completedAt || p.created;
                    if (!tierDate || periodKey(tierDate) !== date) return;
                    const mon = t.verifiedMonetaryCosts ?? t.monetaryCosts;
                    const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
                    cashGrant += Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
                    const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0;
                    const ih = t.verifiedInkindHours ?? t.inkindHours ?? 0;
                    const ir = t.verifiedInkindRate ?? t.inkindRate ?? 0;
                    inKindGrant += ip * ih * ir;
                });
            });
            return { date, deposit, cashGrant, inKindGrant, cumulative: 0 };
        });
        let running = 0;
        dataPoints.forEach(dp => {
            running += dp.cashGrant + dp.inKindGrant;
            dp.cumulative = running;
        });
        const maxBar = Math.max(...dataPoints.map(d => Math.max(d.deposit, d.cashGrant, d.inKindGrant)), 1);
        const maxLine = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].cumulative : 1;
        // Single scale so the cumulative line stays inside the chart (cumulative can be >> maxBar)
        const maxChart = Math.max(maxBar, maxLine);
        return {
            data: dataPoints,
            maxBar,
            maxLine,
            maxChart
        };
    },
    chartCategoryStats() {
        // Per category: sum of (monetary + in-kind labor) for completed tiers only in projects of that category
        const categories = this.categories || [];
        const getProjectCats = (p) => {
            let c = p.categories;
            if (typeof c === 'string') {
                try { c = JSON.parse(c); } catch (e) { c = []; }
            }
            return Array.isArray(c) ? c : [];
        };
        const tierValue = (t) => {
            if (t.status !== 'completed') return 0;
            const mon = t.verifiedMonetaryCosts ?? t.monetaryCosts;
            const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
            const monetary = Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
            const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0;
            const ih = t.verifiedInkindHours ?? t.inkindHours ?? 0;
            const ir = t.verifiedInkindRate ?? t.inkindRate ?? 0;
            return monetary + (ip * ih * ir);
        };
        let stats = categories.map(cat => {
            let value = 0;
            this.projects.forEach(p => {
                const projectCats = getProjectCats(p);
                if (!projectCats.includes(cat)) return;
                if (p.type === 'scholarship') {
                    if (cat === 'Scholarship') value += (p.scholarshipValue ?? p.value ?? 0);
                    return;
                }
                if (p.tiers) p.tiers.forEach(t => { value += tierValue(t); });
            });
            return { name: cat, value };
        });
        const total = stats.reduce((acc, s) => acc + s.value, 0) || 1;
        const filtered = stats.filter(s => s.value > 0).map(s => ({ ...s, percentOfTotal: (s.value / total) * 100 })).sort((a, b) => b.value - a.value);
        return filtered;
    },
    homeCategoryStats() {
        const iconMap = {
            'Infrastructure': 'fas fa-road', 'Education': 'fas fa-graduation-cap',
            'Agriculture': 'fas fa-seedling', 'Health': 'fas fa-heartbeat',
            'Community': 'fas fa-users', 'Scholarship': 'fas fa-award',
            'Environment': 'fas fa-leaf', 'Water': 'fas fa-tint',
            'Energy': 'fas fa-bolt', 'Housing': 'fas fa-home',
            'Nutrition': 'fas fa-utensils', 'Sanitation': 'fas fa-hand-holding-water'
        };
        const getProjectCats = (p) => {
            let c = p.categories;
            if (typeof c === 'string') { try { c = JSON.parse(c); } catch(e) { c = []; } }
            return Array.isArray(c) ? c : [];
        };
        const categories = (this.categories || []).filter(c => c !== 'Scholarship');
        return categories.map(cat => {
            let value = 0, projectCount = 0;
            this.projects.forEach(p => {
                if (p.type === 'scholarship' || !p.tiers) return;
                if (!getProjectCats(p).includes(cat)) return;
                projectCount++;
                p.tiers.forEach(t => {
                    if (t.status !== 'completed') return;
                    const mon = t.verifiedMonetaryCosts ?? t.monetaryCosts;
                    const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
                    value += Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
                });
            });
            const rec = this.categoryRecords?.find(r => r.name === cat);
            const icon = rec?.icon ? (rec.icon.startsWith('fa-') ? 'fas ' + rec.icon : 'fas fa-' + rec.icon) : (iconMap[cat] || 'fas fa-folder');
            return { name: cat, value, projectCount, icon };
        }).filter(c => c.projectCount > 0);
    },
    pieChartData() {
        let accumulatedPercent = 0;
        return this.chartCategoryStats.map(cat => {
            const offset = 100 - accumulatedPercent;
            accumulatedPercent += cat.percentOfTotal;
            return {
                name: cat.name,
                percent: cat.percentOfTotal,
                offset: offset,
                color: this.getCategoryColor(cat.name)
            };
        });
    },
    expensePieChart() {
        const stats = this.expenseStats;
        let cumulative = 0;
        return stats.map((stat, idx) => {
            const slice = {
                name: stat.name,
                percent: stat.percent,
                color: this.getExpenseColor(stat.name, idx),
                offset: -cumulative
            };
            cumulative += stat.percent;
            return slice;
        });
    },
    fundingGapData() {
        // Non-completed projects only (at least one tier not completed). Include in-kind. Total = all tiers value; funded = completed tiers value; gap = total - funded.
        const tierValue = (t, useVerified) => {
            const mon = useVerified ? (t.verifiedMonetaryCosts ?? t.monetaryCosts) : (t.monetaryCosts || {});
            const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
            const monetary = Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
            const ip = useVerified ? (t.verifiedInkindPeople ?? t.inkindPeople ?? 0) : (t.inkindPeople ?? 0);
            const ih = useVerified ? (t.verifiedInkindHours ?? t.inkindHours ?? 0) : (t.inkindHours ?? 0);
            const ir = useVerified ? (t.verifiedInkindRate ?? t.inkindRate ?? 0) : (t.inkindRate ?? 0);
            const inkind = ip * ih * ir;
            let community = 0;
            if (t.communityLabor) {
                const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                community = cl.totalValue ?? ((cl.people || 0) * (cl.hours || 0) * (cl.rate || 0));
            } else {
                const cp = useVerified ? (t.verifiedCommunityPeople ?? t.communityPeople ?? 0) : (t.communityPeople ?? 0);
                const ch = useVerified ? (t.verifiedCommunityHours ?? t.communityHours ?? 0) : (t.communityHours ?? 0);
                const cr = useVerified ? (t.verifiedCommunityRate ?? t.communityRate ?? 0) : (t.communityRate ?? 0);
                community = cp * ch * cr;
            }
            return monetary + inkind + community;
        };
        let nonCompleted = this.projects.filter(p => {
            if (p.type === 'scholarship' || !p.tiers || p.tiers.length === 0) return false;
            const allDone = p.tiers.every(t => t.status === 'completed');
            return !allDone;
        });
        if (this.fundingGapCategoryFilter && this.fundingGapCategoryFilter !== 'All') {
            nonCompleted = nonCompleted.filter(p => {
                const cats = typeof p.categories === 'string' ? (() => { try { return JSON.parse(p.categories); } catch (e) { return []; } })() : (p.categories || []);
                return Array.isArray(cats) && cats.includes(this.fundingGapCategoryFilter);
            });
        }
        return nonCompleted.map(p => {
            const total = p.tiers.reduce((sum, t) => sum + tierValue(t, false), 0);
            const funded = p.tiers.reduce((sum, t) => {
                if (t.status !== 'completed') return sum;
                return sum + tierValue(t, true);
            }, 0);
            const gap = Math.max(0, total - funded);
            const fundedPercent = total > 0 ? (funded / total) * 100 : 0;
            const gapPercent = total > 0 ? (gap / total) * 100 : 0;
            const cats = typeof p.categories === 'string' ? (() => { try { return JSON.parse(p.categories); } catch (e) { return []; } })() : (p.categories || []);
            const category = Array.isArray(cats) && cats.length ? cats[0] : null;
            return {
                id: p.id,
                name: p.title || p.name || 'Untitled',
                title: p.title || p.name || 'Untitled',
                category,
                total,
                funded,
                gap,
                fundedPercent,
                gapPercent,
                completionRatio: total > 0 ? funded / total : 0
            };
        }).sort((a, b) => b.completionRatio - a.completionRatio);
    },
    bubbleChartData() {
        // One bubble per completed tier; value = monetary + in-kind + community per tier; category = parent project; include in-kind projects
        const tierTotal = (t) => {
            const mon = t.verifiedMonetaryCosts ?? t.monetaryCosts;
            const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
            const monetary = Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
            const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0, ih = t.verifiedInkindHours ?? t.inkindHours ?? 0, ir = t.verifiedInkindRate ?? t.inkindRate ?? 0;
            const inkind = ip * ih * ir;
            let community = 0;
            if (t.communityLabor) {
                const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                community = cl.totalValue ?? ((cl.people || 0) * (cl.hours || 0) * (cl.rate || 0));
            } else {
                const cp = t.verifiedCommunityPeople ?? t.communityPeople ?? 0, ch = t.verifiedCommunityHours ?? t.communityHours ?? 0, cr = t.verifiedCommunityRate ?? t.communityRate ?? 0;
                community = cp * ch * cr;
            }
            return monetary + inkind + community;
        };
        const completedTiers = [];
        this.projects.forEach(p => {
            if (p.type === 'scholarship' || !p.tiers) return;
            p.tiers.forEach((t, idx) => {
                if (t.status !== 'completed') return;
                completedTiers.push({ tier: t, project: p, tierIndex: idx });
            });
        });
        if (completedTiers.length === 0) return [];
        const categorySet = new Set();
        completedTiers.forEach(({ project: p }) => {
            const cats = typeof p.categories === 'string' ? (() => { try { return JSON.parse(p.categories); } catch (e) { return []; } })() : (p.categories || []);
            (Array.isArray(cats) ? cats : []).forEach(c => categorySet.add(c));
        });
        const categories = Array.from(categorySet).sort();
        if (categories.length === 0) return [];
        const maxValue = Math.ceil(Math.max(...completedTiers.map(({ tier: t }) => tierTotal(t)), 1) / 500) * 500;
        const chartWidth = 900, chartHeight = 350, categoryWidth = chartWidth / categories.length;
        return completedTiers.map(({ tier: t, project: p, tierIndex: idx }) => {
            const total = tierTotal(t);
            const projectCats = typeof p.categories === 'string' ? (() => { try { return JSON.parse(p.categories); } catch (e) { return []; } })() : (p.categories || []);
            const category = (Array.isArray(projectCats) && projectCats.length) ? projectCats[0] : categories[0];
            const catIdx = categories.indexOf(category);
            const xCenter = 50 + (catIdx * categoryWidth) + (categoryWidth / 2);
            const randomOffset = (Math.random() - 0.5) * (categoryWidth * 0.6);
            const x = xCenter + randomOffset;
            const yPercent = (total / maxValue) * 100;
            const y = 380 - (yPercent / 100 * chartHeight);
            const level = t.level ?? (idx + 1);
            return {
                projectId: p.id,
                tierId: t.id,
                name: (p.title || 'Project') + ' Step ' + level,
                category,
                total,
                x, y,
                color: this.getCategoryColor(category)
            };
        });
    },
    bubbleChartCategories() {
        // Unique categories from projects that have at least one completed tier (including in-kind)
        const categorySet = new Set();
        this.projects.forEach(p => {
            if (p.type === 'scholarship' || !p.tiers) return;
            const hasCompleted = p.tiers.some(t => t.status === 'completed');
            if (!hasCompleted) return;
            const cats = typeof p.categories === 'string' ? (() => { try { return JSON.parse(p.categories); } catch (e) { return []; } })() : (p.categories || []);
            (Array.isArray(cats) ? cats : []).forEach(c => categorySet.add(c));
        });
        const categories = Array.from(categorySet).sort();
        if (categories.length === 0) return [];
        const chartWidth = 900, categoryWidth = chartWidth / categories.length;
        return categories.map((cat, idx) => {
            const xStart = 50 + (idx * categoryWidth);
            return { name: cat, xStart, xEnd: xStart + categoryWidth, xCenter: xStart + (categoryWidth / 2) };
        });
    },
    bubbleChartYAxisTicks() {
        // Max = max per-tier total (monetary + inkind + community) over all completed tiers; round up to 500
        const tierTotal = (t) => {
            const mon = t.verifiedMonetaryCosts ?? t.monetaryCosts;
            const monObj = typeof mon === 'string' ? (JSON.parse(mon || '{}')) : (mon || {});
            const monetary = Object.values(monObj).reduce((a, v) => a + (Number(v) || 0), 0);
            const ip = t.verifiedInkindPeople ?? t.inkindPeople ?? 0, ih = t.verifiedInkindHours ?? t.inkindHours ?? 0, ir = t.verifiedInkindRate ?? t.inkindRate ?? 0;
            const inkind = ip * ih * ir;
            let community = 0;
            if (t.communityLabor) {
                const cl = typeof t.communityLabor === 'string' ? JSON.parse(t.communityLabor || '{}') : (t.communityLabor || {});
                community = cl.totalValue ?? ((cl.people || 0) * (cl.hours || 0) * (cl.rate || 0));
            } else {
                const cp = t.verifiedCommunityPeople ?? t.communityPeople ?? 0, ch = t.verifiedCommunityHours ?? t.communityHours ?? 0, cr = t.verifiedCommunityRate ?? t.communityRate ?? 0;
                community = cp * ch * cr;
            }
            return monetary + inkind + community;
        };
        let actualMax = 0;
        this.projects.forEach(p => {
            if (p.type === 'scholarship' || !p.tiers) return;
            p.tiers.forEach(t => {
                if (t.status !== 'completed') return;
                actualMax = Math.max(actualMax, tierTotal(t));
            });
        });
        if (actualMax <= 0) return [];
        const maxValue = Math.ceil(actualMax / 500) * 500;
        const numTicks = 5, chartHeight = 350;
        const ticks = [];
        for (let i = 0; i <= numTicks; i++) {
            const value = (maxValue / numTicks) * i;
            const y = 380 - ((value / maxValue) * 100 / 100 * chartHeight);
            ticks.push({ value, y, label: '$' + this.formatMoney(value) });
        }
        return ticks;
    },
    totalAllocated() {
        return this.proposals.reduce((sum, p) => sum + (p.allocated || 0), 0);
    },
    remainingSession() {
        return this.sessionBudget - this.totalAllocated;
    },
    countTotalBacklog() {
        return (this.baseBacklogList || []).length;
    },
    visibleBacklog() {
        let list = this.baseBacklogList || [];
        
        // Filter by category
        if (this.filterCategory !== 'All') {
            list = list.filter(p => {
                let projectCategories = p.categories;
                if (typeof projectCategories === 'string') {
                    try {
                        projectCategories = JSON.parse(projectCategories);
                    } catch (e) {
                        projectCategories = [];
                    }
                }
                return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
            });
        }
        
        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(p => 
                p.title.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }
        
        // Sort
        list = [...list];
        if (this.sortOrderBacklog === 'score') {
            list.sort((a, b) => this.getCurrentScore(b) - this.getCurrentScore(a));
        } else if (this.sortOrderBacklog === 'newest') {
            list.sort((a, b) => new Date(this.getProjectCreatedDate(b)) - new Date(this.getProjectCreatedDate(a)));
        } else if (this.sortOrderBacklog === 'oldest') {
            list.sort((a, b) => new Date(this.getProjectCreatedDate(a)) - new Date(this.getProjectCreatedDate(b)));
        } else if (this.sortOrderBacklog === 'inprogress') {
            list = list.filter(p => p.tiers?.some(t => t.status === 'in_progress'));
        } else if (this.sortOrderBacklog === 'status') {
            list.sort((a, b) => {
                const aProgress = this.getProjectProgress(a);
                const bProgress = this.getProjectProgress(b);
                return bProgress - aProgress;
            });
        } else if (this.sortOrderBacklog === 'expensive') {
            list.sort((a, b) => this.getTotalCost(b) - this.getTotalCost(a));
        } else if (this.sortOrderBacklog === 'cheap') {
            list.sort((a, b) => this.getTotalCost(a) - this.getTotalCost(b));
        }
        
        // No pagination - return all filtered projects
        return list;
    },
    
    hasMoreBacklog() {
        // Always return false since we show all projects
        return false;
    },
    visibleCompleted() {
        let list = this.completedProjects || [];
        
        // Filter by category
        if (this.filterCategory !== 'All') {
            // Special handling for "Scholarship" category
            if (this.filterCategory === 'Scholarship') {
                list = list.filter(p => p.type === 'scholarship');
            } else {
                // Regular category filter (exclude scholarships from regular categories)
                list = list.filter(p => {
                    if (p.type === 'scholarship') return false;
                    let projectCategories = p.categories;
                    if (typeof projectCategories === 'string') {
                        try {
                            projectCategories = JSON.parse(projectCategories);
                        } catch (e) {
                            projectCategories = [];
                        }
                    }
                    return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
                });
            }
        }
        
        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(p => 
                p.title.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }
        
        // Sort
        list = [...list];
        if (this.sortOrderCompleted === 'newest') {
            list.sort((a, b) => this.getProjectCompletedDateForSort(b) - this.getProjectCompletedDateForSort(a));
        } else if (this.sortOrderCompleted === 'oldest') {
            list.sort((a, b) => this.getProjectCompletedDateForSort(a) - this.getProjectCompletedDateForSort(b));
        } else if (this.sortOrderCompleted === 'expensive') {
            list.sort((a, b) => this.getTotalCost(b) - this.getTotalCost(a));
        } else if (this.sortOrderCompleted === 'cheap') {
            list.sort((a, b) => this.getTotalCost(a) - this.getTotalCost(b));
        }
        
        // No pagination - return all filtered projects
        return list;
    },
    
    hasMoreCompleted() {
        // Always return false since we show all projects
        return false;
    },
    
    // Filtered projects for map (without pagination limit)
    filteredProjectsForMapBacklog() {
        let list = this.baseBacklogList || [];
        
        // Filter by category
        if (this.filterCategory !== 'All') {
            list = list.filter(p => {
                let projectCategories = p.categories;
                if (typeof projectCategories === 'string') {
                    try {
                        projectCategories = JSON.parse(projectCategories);
                    } catch (e) {
                        projectCategories = [];
                    }
                }
                return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
            });
        }
        
        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(p => 
                p.title.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }
        
        // Sort (same as visibleBacklog)
        list = [...list];
        if (this.sortOrderBacklog === 'newest') {
            list.sort((a, b) => new Date(this.getProjectCreatedDate(b)) - new Date(this.getProjectCreatedDate(a)));
        } else if (this.sortOrderBacklog === 'oldest') {
            list.sort((a, b) => new Date(this.getProjectCreatedDate(a)) - new Date(this.getProjectCreatedDate(b)));
        } else if (this.sortOrderBacklog === 'inprogress') {
            list = list.filter(p => p.tiers?.some(t => t.status === 'in_progress'));
        } else if (this.sortOrderBacklog === 'status') {
            list.sort((a, b) => {
                const aProgress = this.getProjectProgress(a);
                const bProgress = this.getProjectProgress(b);
                return bProgress - aProgress;
            });
        } else if (this.sortOrderBacklog === 'expensive') {
            list.sort((a, b) => this.getTotalCost(b) - this.getTotalCost(a));
        } else if (this.sortOrderBacklog === 'cheap') {
            list.sort((a, b) => this.getTotalCost(a) - this.getTotalCost(b));
        }
        
        // NO pagination limit - return ALL filtered projects for map
        return list;
    },
    
    filteredProjectsForMapCompleted() {
        let list = this.completedProjects || [];
        
        // Filter by category
        if (this.filterCategory !== 'All') {
            list = list.filter(p => {
                let projectCategories = p.categories;
                if (typeof projectCategories === 'string') {
                    try {
                        projectCategories = JSON.parse(projectCategories);
                    } catch (e) {
                        projectCategories = [];
                    }
                }
                return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
            });
        }
        
        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            list = list.filter(p => 
                p.title.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }
        
        // Sort (same as visibleCompleted)
        list = [...list];
        if (this.sortOrderCompleted === 'newest') {
            list.sort((a, b) => this.getProjectCompletedDateForSort(b) - this.getProjectCompletedDateForSort(a));
        } else if (this.sortOrderCompleted === 'oldest') {
            list.sort((a, b) => this.getProjectCompletedDateForSort(a) - this.getProjectCompletedDateForSort(b));
        } else if (this.sortOrderCompleted === 'expensive') {
            list.sort((a, b) => this.getTotalCost(b) - this.getTotalCost(a));
        } else if (this.sortOrderCompleted === 'cheap') {
            list.sort((a, b) => this.getTotalCost(a) - this.getTotalCost(b));
        }
        
        // NO pagination limit - return ALL filtered projects for map
        return list;
    },
    getTotalBacklogCount() {
        try {
            let list = (this.baseBacklogList || []);
            
            if (this.filterCategory !== 'All') {
                list = list.filter(p => {
                    if (!p) return false;
                    let projectCategories = p.categories;
                    if (typeof projectCategories === 'string') {
                        try {
                            projectCategories = JSON.parse(projectCategories);
                        } catch (e) {
                            projectCategories = [];
                        }
                    }
                    return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
                });
            }
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                list = list.filter(p => 
                    p && (
                        (p.title && p.title.toLowerCase().includes(query)) ||
                        (p.description && p.description.toLowerCase().includes(query))
                    )
                );
            }
            return list.length;
        } catch (e) {
            console.error('Error in getTotalBacklogCount:', e);
            return 0;
        }
    },
    getTotalCompletedCount() {
        try {
            let list = (this.completedProjects || []);
            
            if (this.filterCategory !== 'All') {
                list = list.filter(p => {
                    if (!p) return false;
                    let projectCategories = p.categories;
                    if (typeof projectCategories === 'string') {
                        try {
                            projectCategories = JSON.parse(projectCategories);
                        } catch (e) {
                            projectCategories = [];
                        }
                    }
                    return Array.isArray(projectCategories) && projectCategories.includes(this.filterCategory);
                });
            }
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                list = list.filter(p => 
                    p && (
                        (p.title && p.title.toLowerCase().includes(query)) ||
                        (p.description && p.description.toLowerCase().includes(query))
                    )
                );
            }
            return list.length;
        } catch (e) {
            console.error('Error in getTotalCompletedCount:', e);
            return 0;
        }
    },
    // Aliases for template compatibility
    sortedFilteredBacklog() {
        return this.visibleBacklog;
    },
    sortedFilteredCompleted() {
        return this.visibleCompleted;
    },
    tempBudgetTotal() {
        const cashCosts = (this.tempBudget.assets || 0) + 
                          (this.tempBudget.services || 0) + 
                          (this.tempBudget.logistics || 0) + 
                          (this.tempBudget.support || 0);
        // For in-kind projects, add labor value to total
        if (this.activeBudgetTier && this.activeBudgetTier.isInKindContext) {
            const laborValue = (this.tempInKind.people || 0) * (this.tempInKind.hours || 0) * (this.tempInKind.rate || 0);
            return cashCosts + laborValue;
        }
        return cashCosts;
    },
    // Returns only proposals that were allocated funds (funded tiers)
    fundedProposals() {
        return this.proposals.filter(p => p.allocated > 0);
    },
    // Check if any tiers are marked as algorithmSelected (lock Algorithmic Grant tab)
    hasAlgorithmSelectedTiers() {
        return this.projects.some(p => 
            p.tiers?.some(t => t.algorithmSelected && t.status === 'backlog')
        );
    },
    verificationQueue() {
        const queue = [];
        this.projects.forEach(proj => {
            if (proj.type === 'scholarship' || !proj.tiers) return;
            proj.tiers.forEach(tier => {
                // Show tiers with pending allocations to verify:
                // - Cash allocated (allocatedAmount > 0)
                // - OR in-kind labor allocated (laborPlannedPeople > 0 and not yet fully funded)
                const hasCashAllocation = (tier.allocatedAmount || 0) > 0;
                const hasLaborAllocation = (tier.laborPlannedPeople || 0) > 0 && tier.status !== 'completed';
                
                // Only show if there's actually something allocated to verify
                // Check that funded < cost (still has remaining to verify for labor-only cases)
                const hasAllocation = hasCashAllocation || (hasLaborAllocation && (tier.funded || 0) < (tier.cost || 0));
                
                if (hasAllocation) {
                    queue.push({ project: proj, tier: tier });
                }
            });
        });
        return queue;
    },
    getInKindProjects() {
        let list = [];
        this.projects.forEach(p => {
            if (!p.isInKind) return;
            // Check if project is completed (all tiers status = 'completed')
            const isCompleted = p.tiers && p.tiers.length > 0 && p.tiers.every(t => t.status === 'completed');
            if (isCompleted) return;
            
            // Sort tiers by level to process in order
            const sortedTiers = [...(p.tiers || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
            
            // Find the first tier that needs allocation (not completed, not pending verification)
            const nextTier = sortedTiers.find(t => {
                const funded = t.funded || 0;
                const cost = t.cost || 0;
                const allocatedAmount = t.allocatedAmount || 0;
                const laborPlannedPeople = t.laborPlannedPeople || 0;
                const status = t.status || '';
                
                // Show tier if: not completed AND not currently allocated
                // Check allocatedAmount for cash AND laborPlannedPeople for labor (not t.field - that's just allocation method type)
                const hasPendingAllocation = allocatedAmount > 0 || laborPlannedPeople > 0;
                // Also need to check if tier still needs funding (funded < cost)
                const needsFunding = funded < cost;
                
                // For partially verified tiers, check if there's still labor OR cash remaining
                const laborFunded = t.laborFunded || 0;
                const costsFunded = t.costsFunded || 0;
                
                // Get original values from inKindDetails
                let inKindDetails = {};
                if (t.inKindDetails) {
                    if (typeof t.inKindDetails === 'string') {
                        try { inKindDetails = JSON.parse(t.inKindDetails); } catch (e) { inKindDetails = {}; }
                    } else {
                        inKindDetails = t.inKindDetails;
                    }
                }
                const originalLaborVal = (inKindDetails.people || 0) * (inKindDetails.hours || 0) * (inKindDetails.rate || 0);
                const bd = this.getBreakdown(t);
                const originalCash = (bd.assets || 0) + (bd.services || 0) + (bd.logistics || 0) + (bd.support || 0);
                
                const remainingLabor = Math.max(0, originalLaborVal - laborFunded);
                const remainingCash = Math.max(0, originalCash - costsFunded);
                const hasRemaining = remainingLabor > 0 || remainingCash > 0;
                
                return status !== 'completed' && !hasPendingAllocation && needsFunding && hasRemaining;
            });
            
            if (!nextTier) return; // All tiers are completed or pending verification
            
            // Get inKindDetails (for original labor and wallet info)
            let inKindDetails = {};
            if (nextTier.inKindDetails) {
                if (typeof nextTier.inKindDetails === 'string') {
                    try {
                        inKindDetails = JSON.parse(nextTier.inKindDetails);
                    } catch (e) {
                        inKindDetails = {};
                    }
                } else {
                    inKindDetails = nextTier.inKindDetails;
                }
            }
            
            // Get ORIGINAL planned values from inKindDetails
            const originalLaborPeople = inKindDetails.people || 0;
            const originalLaborHours = inKindDetails.hours || 0;
            const originalLaborRate = inKindDetails.rate || 5;
            const originalLaborVal = originalLaborPeople * originalLaborHours * originalLaborRate;
            
            // Get ORIGINAL planned cash costs from breakdown
            let bd = this.getBreakdown(nextTier);
            const originalCash = (bd.assets || 0) + (bd.services || 0) + (bd.logistics || 0) + (bd.support || 0);
            
            // Get ALREADY VERIFIED amounts
            const laborFunded = nextTier.laborFunded || 0;
            const costsFunded = nextTier.costsFunded || 0;
            
            // Calculate REMAINING amounts (what still needs to be allocated)
            const remainingLaborVal = Math.max(0, originalLaborVal - laborFunded);
            const remainingCash = Math.max(0, originalCash - costsFunded);
            
            // Get wallet info from inKindDetails
            let walletId = inKindDetails.walletId ? String(inKindDetails.walletId) : null;
            let walletName = null;
            if (walletId) {
                const wallet = this.wallets.find(w => String(w.id) === walletId);
                walletName = wallet ? wallet.name : null;
            }
            
            // Calculate score using new algorithm
            let score = this.computeStepScore(nextTier) || parseFloat((nextTier.utility || nextTier.u || 5).toFixed(1));
            
            list.push({
                id: p.id + '_' + nextTier.level,
                projId: p.id,
                projName: p.title,
                level: nextTier.level,
                intervention: nextTier.intervention || '',
                cost: nextTier.cost || 0,
                // REMAINING values (what still needs allocation)
                laborVal: remainingLaborVal,
                cashVal: remainingCash,
                // Original values (for reference)
                originalLaborVal: originalLaborVal,
                originalCash: originalCash,
                // Already verified (for display)
                laborFunded: laborFunded,
                costsFunded: costsFunded,
                // Original labor details (for allocation modal)
                laborPeople: originalLaborPeople,
                laborHours: originalLaborHours,
                laborRate: originalLaborRate,
                score: score,
                allowPartial: nextTier.allowPartial !== false, // Track divisibility
                // Wallet info from inKindDetails
                walletId: walletId,
                walletName: walletName,
                tierRef: nextTier, // Reference for modification
                projRef: p
            });
        });
        // Sort by score descending (humanitarian priority; null = lowest)
        return list.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    },
    getManualCashGrantProjects() {
        let list = [];
        this.projects.forEach(p => {
            // Skip scholarships (they have their own process)
            if (p.type === 'scholarship') return;
            
            // Skip in-kind projects (they use the In-Kind Allocation flow, not cash grants)
            if (p.isInKind) return;
            
            // Skip projects without tiers
            if (!p.tiers || p.tiers.length === 0) return;
            
            // Check if project is completed (all tiers status = 'completed')
            const isCompleted = p.tiers.every(t => t.status === 'completed');
            if (isCompleted) return; // Skip completed projects
            
            // Sort tiers by level to process in order
            const sortedTiers = [...(p.tiers || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
            
            // Find the first tier that needs funding (monetary funded < cost) and is not currently allocated
            const nextTier = sortedTiers.find(t => {
                // Use costsFunded for monetary tracking (funded may include labor value)
                const monetaryFunded = t.costsFunded !== undefined ? t.costsFunded : (t.funded || 0);
                const cost = t.cost || 0;
                const allocatedAmount = t.allocatedAmount || 0;
                const status = t.status || 'pending';
                
                // Show tier if: monetary funded < cost AND not currently allocated (allocatedAmount = 0) AND not completed
                return monetaryFunded < cost && allocatedAmount === 0 && status !== 'completed';
            });
            
            if (!nextTier) return; // No tier needs funding
            
            // Check if this tier still needs funding (has remaining monetary amount)
            const monetaryFunded = nextTier.costsFunded !== undefined ? nextTier.costsFunded : (nextTier.funded || 0);
            const remainingAmount = (nextTier.cost || 0) - monetaryFunded;
            if (remainingAmount <= 0) return; // Skip if fully funded (no remaining amount)
            
            const breakdown = this.getBreakdown(nextTier);
            
            // Calculate score using new algorithm
            const score = this.computeStepScore(nextTier);
            const scoreBreakdown = this.getScoreBreakdown(nextTier);
            
            list.push({
                id: `${p.id}_${nextTier.level}`,
                projId: p.id,
                tierId: nextTier.id,
                projName: p.title,
                level: nextTier.level,
                problem: nextTier.problem || '',
                intervention: nextTier.intervention || '',
                cost: nextTier.cost || 0,
                funded: nextTier.funded || 0,
                costsFunded: nextTier.costsFunded,  // For monetary tracking (may include labor in funded)
                breakdown: breakdown,
                score: score != null ? parseFloat(Number(score).toFixed(2)) : null,
                scoreBreakdown: scoreBreakdown,
                tierRef: nextTier,
                projRef: p
            });
        });
        
        // Sort by score descending (highest priority first)
        return list.sort((a, b) => b.score - a.score);
    },
    filteredManualCashGrantProjects() {
        if (!this.searchManualGrant || !this.searchManualGrant.trim()) {
            return this.getManualCashGrantProjects;
        }
        const searchTerm = this.searchManualGrant.toLowerCase().trim();
        return this.getManualCashGrantProjects.filter(item => {
            return item.projName.toLowerCase().includes(searchTerm) ||
                   item.problem.toLowerCase().includes(searchTerm) ||
                   item.intervention.toLowerCase().includes(searchTerm) ||
                   item.level.toString().includes(searchTerm);
        });
    },
    filteredTransactions() {
        let filtered = this.transactions.slice();
        
        // Filter by wallet
        if (this.filterWallet !== 'all') {
            filtered = filtered.filter(tx => {
                // Check walletId
                if (tx.walletId && String(tx.walletId) === String(this.filterWallet)) {
                    return true;
                }
                // Check sources array
                if (tx.sources && Array.isArray(tx.sources)) {
                    return tx.sources.some(source => {
                        const wallet = this.wallets.find(w => w.name === source.name);
                        return wallet && String(wallet.id) === String(this.filterWallet);
                    });
                }
                return false;
            });
        }
        
        // Filter by type
        if (this.filterType !== 'all') {
            filtered = filtered.filter(tx => {
                if (this.filterType === 'deposit') {
                    // Regular deposits only, exclude transfers
                    return tx.type === 'DEPOSIT' && 
                           (!tx.description || !tx.description.includes('Transfer'));
                }
                if (this.filterType === 'donation') {
                    return tx.type === 'DONATION';
                }
                if (this.filterType === 'grant') {
                    return tx.type === 'GRANT';
                }
                if (this.filterType === 'scholarship') {
                    return tx.type === 'WITHDRAW' && 
                           tx.description && 
                           tx.description.includes('Scholarship Fixed Costs');
                }
                if (this.filterType === 'in-kind') {
                    return tx.type === 'WITHDRAW' && 
                           tx.description && 
                           tx.description.includes('In-Kind Exec');
                }
                if (this.filterType === 'withdrawal') {
                    // Regular withdrawals only, exclude transfers and special types
                    return tx.type === 'WITHDRAW' && 
                           (!tx.description || 
                            (!tx.description.includes('Scholarship Fixed Costs') && 
                             !tx.description.includes('In-Kind Exec') &&
                             !tx.description.includes('Transfer')));
                }
                return true;
            });
        }
        
        // Sort by date (newest first)
        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    
    // ========== NEW STATS PAGE COMPUTED PROPERTIES ==========
    lifecycleFunnel() {
        const getAllocated = (t) => (t.allocatedMonetaryCost ?? t.allocatedAmount ?? 0) || 0;
        const pending = this.projects.filter(p => {
            if (!p.tiers || p.tiers.length === 0) return true;
            return p.tiers.every(t => getAllocated(t) === 0);
        }).length;
        
        const allocated = this.projects.filter(p => {
            if (!p.tiers || p.tiers.length === 0) return false;
            return p.tiers.some(t => getAllocated(t) > 0);
        }).length;
        
        // Funded = "in progress / verifying": has allocation or in_progress but not all tiers completed with proof
        const funded = this.projects.filter(p => {
            if (!p.tiers || p.tiers.length === 0) return false;
            const allCompleted = p.tiers.every(t => t.status === 'completed');
            if (allCompleted) return false;
            return p.tiers.some(t => t.status === 'in_progress' || (getAllocated(t) > 0 && t.status !== 'completed'));
        }).length;
        
        const completed = this.completedProjects.length;
        
        const total = this.projects.length || 1;
        
        return [
            { label: 'Pending', count: pending, percent: Math.round((pending/total)*100), color: '#ef4444', clipPath: 'polygon(0 0, 100% 0, 95% 100%, 5% 100%)' },
            { label: 'Allocated', count: allocated, percent: Math.round((allocated/total)*100), color: '#f59e0b', clipPath: 'polygon(5% 0, 95% 0, 90% 100%, 10% 100%)' },
            { label: 'Funded', count: funded, percent: Math.round((funded/total)*100), color: '#3b82f6', clipPath: 'polygon(10% 0, 90% 0, 85% 100%, 15% 100%)' },
            { label: 'Completed', count: completed, percent: Math.round((completed/total)*100), color: '#10b981', clipPath: 'polygon(15% 0, 85% 0, 80% 100%, 20% 100%)' }
        ];
    },
    
    categoryPerformance() {
        const catMap = {};
        this.categories.forEach(cat => {
            if (cat === 'Scholarship') return;
            const projects = this.projects.filter(p => {
                const cats = typeof p.categories === 'string' ? JSON.parse(p.categories || '[]') : (p.categories || []);
                return cats.includes(cat);
            });
            const completed = projects.filter(p => this.completedProjects.includes(p)).length;
            const totalFunded = projects.reduce((sum, p) => {
                if (!p.tiers) return sum;
                return sum + p.tiers.reduce((tSum, t) => {
                    const v = t.costsFunded ?? t.funded ?? (t.status === 'completed' ? this.getTierDisplayMonetary(t) + this.getTierDisplayInkindValue(t) : 0);
                    return tSum + (v || 0);
                }, 0);
            }, 0);
            const tierCost = (t) => (t.cost != null && t.cost !== '') ? t.cost : this.getTierTotalValue(t);
            const totalCost = projects.reduce((sum, p) => {
                if (!p.tiers) return sum;
                return sum + p.tiers.reduce((tSum, t) => tSum + tierCost(t), 0);
            }, 0);
            
            catMap[cat] = {
                name: cat,
                projects: projects.length,
                funded: totalFunded,
                avgCost: projects.length > 0 ? totalCost / projects.length : 0,
                completionRate: projects.length > 0 ? (completed / projects.length) * 100 : 0
            };
        });
        return Object.values(catMap);
    },
    
    allocationStats() {
        let overBudget = 0, onBudget = 0, underBudget = 0;
        this.projects.forEach(p => {
            if (!p.tiers) return;
            p.tiers.forEach(t => {
                const allocated = t.allocatedMonetaryCost ?? t.allocatedAmount ?? 0;
                if (allocated <= 0) return;
                // Verified = actual monetary spent (from verifiedMonetaryCosts when completed)
                const verified = (t.status === 'completed')
                    ? this.getTierDisplayMonetary(t)
                    : (t.costsFunded ?? t.funded ?? 0);
                if (verified === 0) return; // Not verified yet
                
                const diff = Math.abs(verified - allocated) / allocated;
                if (diff < 0.05) onBudget++; // Within 5%
                else if (verified > allocated) overBudget++;
                else underBudget++;
            });
        });
        return { overBudget, onBudget, underBudget };
    },
    
    efficiencyMetrics() {
        const totalProjects = this.projects.length || 1;
        // Use getTierTotalValue for cost; for "funded" use display monetary+inkind when completed
        const tierCost = (t) => (t.cost != null && t.cost !== '') ? t.cost : this.getTierTotalValue(t);
        const tierFunded = (t) => (t.costsFunded != null && t.costsFunded !== '') ? t.costsFunded : (t.funded ?? (t.status === 'completed' ? this.getTierDisplayMonetary(t) + this.getTierDisplayInkindValue(t) : 0));
        const avgCost = this.projects.reduce((sum, p) => {
            if (!p.tiers) return sum;
            return sum + p.tiers.reduce((tSum, t) => tSum + tierCost(t), 0);
        }, 0) / totalProjects;
        
        const avgDaysToComplete = this.completedProjects.length
            ? this.completedProjects.reduce((sum, p) => {
                const created = new Date(this.getProjectCreatedDate(p));
                const completed = new Date(this.getProjectCompletedDateForSort(p));
                return sum + Math.max(0, (completed - created) / (1000 * 60 * 60 * 24));
            }, 0) / this.completedProjects.length
            : 0;
        
        const completionRate = this.getCompletionRate();
        const avgFundedPerProject = this.projects.reduce((sum, p) => {
            if (!p.tiers) return sum;
            return sum + p.tiers.reduce((tSum, t) => tSum + tierFunded(t), 0);
        }, 0) / totalProjects;
        
        return [
            { name: 'Completion Rate', value: completionRate, color: '#10b981', description: `${completionRate.toFixed(1)}% projects completed` },
            { name: 'Avg Cost', value: Math.min(avgCost / 1000, 100), color: '#3b82f6', description: `$${this.formatMoney(avgCost)} per project` },
            { name: 'Speed', value: Math.min(100 - (avgDaysToComplete / 2), 100), color: '#f59e0b', description: `${avgDaysToComplete.toFixed(0)} days avg` },
            { name: 'Funding', value: avgCost > 0 ? Math.min((avgFundedPerProject / avgCost) * 100, 100) : 0, color: '#8b5cf6', description: avgCost > 0 ? `${((avgFundedPerProject / avgCost) * 100).toFixed(1)}% funded` : 'N/A' }
        ];
    },
    
    // Design Playground: Find specific project for testing designs
    playgroundProject() {
        return this.projects.find(p => p.title === 'Clean Water Filtration System') || this.projects[0] || null;
    },
    
    // ========== COMPASSIONATE/EMPATHIC GIVING COMPUTED PROPERTIES ==========
    
    // Next highest-scoring tier NOT in fundedProposals (for nudge feature)
    nextNudgeTier() {
        if (!this.proposals || this.proposals.length === 0) return null;
        
        // Get IDs of tiers that are already funded/selected
        const fundedIds = this.fundedProposals.map(p => p.tierId);
        
        // Find highest-score tier that is NOT funded and has monetaryCosts > 0
        const unfunded = this.proposals.filter(p => 
            !fundedIds.includes(p.tierId) && 
            (p.monetaryCosts || 0) > 0
        );
        
        if (unfunded.length === 0) return null;
        
        // Already sorted by score in runAlgorithm, just get first one
        return unfunded[0];
    },
    
    // How much more budget needed for the next tier
    nudgeAmount() {
        if (!this.nextNudgeTier) return 0;
        const needed = this.nextNudgeTier.monetaryCosts || 0;
        const remaining = this.remainingSession;
        return Math.max(0, needed - remaining);
    },
    
    // Can we nudge? Check if next tier exists and wallet has enough
    canNudge() {
        if (!this.nextNudgeTier) return false;
        if (this.nudgeAmount <= 0) return false; // Already fits in budget
        const newBudget = this.sessionBudget + this.nudgeAmount;
        return newBudget <= this.totalLiquidity;
    },
    
    // Empathy ratio (derived from compassion ratio)
    empathyRatio() {
        return 100 - this.compassionRatio;
    },
    
    // All eligible tiers NOT selected in compassion phase, sorted by score ASCENDING (lowest first)
    empathyTiers() {
        if (!this.proposals || this.proposals.length === 0) return [];
        
        // Get IDs of tiers that were selected in compassion phase (funded)
        const compassionIds = this.fundedProposals.map(p => p.tierId);
        
        // Filter out compassion selections, keep only those with monetary cost
        const available = this.proposals.filter(p => 
            !compassionIds.includes(p.tierId) && 
            (p.monetaryCosts || 0) > 0
        );
        
        // Sort by score ASCENDING (lowest first - inverse of compassion; null = no score = last)
        return [...available].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));
    },
    
    // Sum of empathy selections monetary costs
    selectedEmpathyTotal() {
        return this.empathySelections.reduce((sum, p) => sum + (p.monetaryCosts || 0), 0);
    },
    
    // Remaining empathy budget
    empathyBudgetRemaining() {
        return this.empathyBudget - this.selectedEmpathyTotal;
    },
    
    // Compare demo score to ALL backlog tier scores (for Score Explanation Modal)
    demoScoreComparison() {
        // Get the demo score from getDummyScoreResult()
        const demoScore = this.getDummyScoreResult ? this.getDummyScoreResult().score : 0;
        
        // Get ALL incomplete steps across all projects (not just first eligible)
        const allBacklogSteps = [];
        const projectIds = new Set();
        
        this.projects.forEach(proj => {
            if (proj.type === 'scholarship') return;
            if (!proj.tiers) return;
            
            proj.tiers.forEach(tier => {
                // Include if not completed (status !== 'completed' or no proof)
                const isCompleted = tier.status === 'completed';
                if (!isCompleted) {
                    const score = this.computeStepScore(tier);
                    allBacklogSteps.push({ projId: proj.id, score });
                    projectIds.add(proj.id);
                }
            });
        });
        
        const totalTiers = allBacklogSteps.length;
        const totalProjects = projectIds.size;
        
        if (totalTiers === 0) {
            return { higher: 0, lower: 0, equal: 0, total: 0, totalProjects: 0 };
        }
        
        let higher = 0;
        let lower = 0;
        let equal = 0;
        
        allBacklogSteps.forEach(step => {
            if (step.score == null) {
                lower++; // No cost data = no score, count as lower
            } else if (step.score > demoScore) {
                higher++;
            } else if (step.score < demoScore) {
                lower++;
            } else {
                equal++;
            }
        });
        
        return {
            higher,
            lower,
            equal,
            total: totalTiers,
            totalProjects,
            higherPercent: Math.round((higher / totalTiers) * 100),
            lowerPercent: Math.round((lower / totalTiers) * 100)
        };
    },

    /** Unique users from logbook entries (for filter dropdown). */
    logbookUsers() {
        const entries = this.logbookEntries || [];
        const seen = new Map();
        entries.forEach(entry => {
            const userId = entry.expand?.user?.id;
            if (userId && !seen.has(userId)) {
                seen.set(userId, entry.expand.user.name || entry.expand.user.email || userId);
            }
        });
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },

    /** Unique users from step management discussion comments (thread-level when a thread is selected). */
    stepMgmtDiscussionUsers() {
        const seen = new Map();
        const source = this.stepMgmtSelectedThread ? (this.stepMgmtThreadComments || []) : (this.stepMgmtComments || []);
        source.forEach(c => {
            if (c.userName && !seen.has(c.userName)) {
                seen.set(c.userName, c.userName);
            }
        });
        return Array.from(seen.values()).sort();
    },

    /** Filtered step management discussion comments (search + user filter). Works for both thread-level and flat. */
    stepMgmtFilteredComments() {
        let list = this.stepMgmtSelectedThread ? (this.stepMgmtThreadComments || []) : (this.stepMgmtComments || []);
        if (this.stepMgmtDiscussionUserFilter) {
            list = list.filter(c => c.userName === this.stepMgmtDiscussionUserFilter);
        }
        if (this.stepMgmtDiscussionSearch && this.stepMgmtDiscussionSearch.trim()) {
            const q = this.stepMgmtDiscussionSearch.toLowerCase();
            list = list.filter(c => {
                const plain = (c.content || '').replace(/<[^>]*>/g, '').toLowerCase();
                return plain.includes(q);
            });
        }
        return list;
    },

    /** Whether the currently open sub-modal tier is locked (in_progress or completed). */
    stepModalTierLocked() {
        const tier = this.modalProject?.tiers?.[this.stepModalTierIndex]
        return tier?.status === 'in_progress' || tier?.status === 'completed'
    },

    /** Logbook entries filtered by date range, event type, and user. */
    filteredLogbookEntries() {
        const entries = this.logbookEntries || [];
        const from = this.logbookFilterFrom;
        const to = this.logbookFilterTo;
        const eventType = this.logbookFilterEventType || 'all';
        const userFilter = this.logbookFilterUser || 'all';
        if (!from && !to && eventType === 'all' && userFilter === 'all') return entries;
        const fromTime = from ? new Date(from + 'T00:00:00').getTime() : 0;
        const toTime = to ? new Date(to + 'T23:59:59.999').getTime() : Number.MAX_SAFE_INTEGER;
        return entries.filter((entry) => {
            const created = entry.created ? new Date(entry.created).getTime() : 0;
            if (created < fromTime || created > toTime) return false;
            if (eventType !== 'all' && this.getLogbookEventType(entry.action) !== eventType) return false;
            if (userFilter !== 'all' && (entry.expand?.user?.id || '') !== userFilter) return false;
            return true;
        });
    },
    /** URL for the FM app iframe (same host, port 5174) */
    fmAppUrl() {
        return `${window.location.protocol}//${window.location.hostname}:5174`;
    },
    /** Precomputed donor breakdowns (inkind, community, donations) — avoids O(n) per-render calls */
    donorBreakdownMap() {
        try {
            const map = new Map();
            for (const log of (this.donorLaborLogs || [])) {
                if (!log?.donorId) continue;
                if (!map.has(log.donorId)) map.set(log.donorId, { inkind: 0, community: 0, donations: 0 });
                const b = map.get(log.donorId);
                if (log.type === 'inkind') b.inkind += (log.value || 0);
                else if (log.type === 'community') b.community += (log.value || 0);
            }
            for (const proj of (this.projects || [])) {
                for (const tier of (proj.tiers || [])) {
                    for (const d of (tier.donations || [])) {
                        if (!d?.donorId) continue;
                        if (!map.has(d.donorId)) map.set(d.donorId, { inkind: 0, community: 0, donations: 0 });
                        map.get(d.donorId).donations += (d.value || 0);
                    }
                }
            }
            return map;
        } catch (e) {
            return new Map();
        }
    },
    /** Hours per donor per type (inkind, community) — for labor tabs only */
    donorHoursMap() {
        try {
            const map = new Map();
            for (const log of (this.donorLaborLogs || [])) {
                if (!log?.donorId) continue;
                const hours = (log.hours || 0) * (log.people || 1);
                if (!map.has(log.donorId)) map.set(log.donorId, { inkind: 0, community: 0 });
                const h = map.get(log.donorId);
                if (log.type === 'inkind') h.inkind += hours;
                else if (log.type === 'community') h.community += hours;
            }
            return map;
        } catch (e) {
            return new Map();
        }
    },
    /** Donors filtered by active tab (only those with > 0 for that type) */
    donorsForActiveTab() {
        try {
            const tab = this.donorActiveTab || 'community';
            const map = this.donorBreakdownMap;
            return (this.donors || []).filter((d) => {
                const b = map?.get(d.id) || { inkind: 0, community: 0, donations: 0 };
                return (b[tab] || 0) > 0;
            });
        } catch (e) {
            return [];
        }
    },
    /** Donors for active tab, sorted by donorTableSort */
    donorsForActiveTabSorted() {
        try {
            const list = [...(this.donorsForActiveTab || [])];
            const tab = this.donorActiveTab || 'community';
            const map = this.donorBreakdownMap || new Map();
            const hoursMap = this.donorHoursMap || new Map();
            const sort = this.donorTableSort || 'amount_desc';
            const self = this;
            if (sort === 'name') {
                list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else if (sort === 'projects_desc' || sort === 'projects_asc') {
                const mult = sort === 'projects_asc' ? 1 : -1;
                list.sort((a, b) => {
                    const pa = self.getDonorProjectCount?.(a.id) ?? 0;
                    const pb = self.getDonorProjectCount?.(b.id) ?? 0;
                    return mult * (pa - pb);
                });
            } else if (sort === 'hours_desc' || sort === 'hours_asc') {
                if (tab === 'community' || tab === 'inkind') {
                    const mult = sort === 'hours_asc' ? 1 : -1;
                    list.sort((a, b) => {
                        const ha = hoursMap.get(a.id)?.[tab] || 0;
                        const hb = hoursMap.get(b.id)?.[tab] || 0;
                        return mult * (ha - hb);
                    });
                } else {
                    list.sort((a, b) => {
                        const va = map.get(a.id)?.[tab] || 0;
                        const vb = map.get(b.id)?.[tab] || 0;
                        return vb - va;
                    });
                }
            } else if (sort === 'amount_asc') {
                list.sort((a, b) => {
                    const va = map.get(a.id)?.[tab] || 0;
                    const vb = map.get(b.id)?.[tab] || 0;
                    return va - vb;
                });
            } else {
                list.sort((a, b) => {
                    const va = map.get(a.id)?.[tab] || 0;
                    const vb = map.get(b.id)?.[tab] || 0;
                    return vb - va;
                });
            }
            return list;
        } catch (e) {
            return [];
        }
    },
    /** Hero totals for donor cards */
    donorHeroTotals() {
        const fallback = { inkind: 0, community: 0, donations: 0 };
        try {
            let inkind = 0, community = 0, donations = 0;
            for (const log of (this.donorLaborLogs || [])) {
                if (log.type === 'inkind') inkind += (log.value || 0);
                else if (log.type === 'community') community += (log.value || 0);
            }
            for (const proj of (this.projects || [])) {
                for (const tier of (proj.tiers || [])) {
                    for (const d of (tier.donations || [])) donations += (d.value || 0);
                }
            }
            return { inkind, community, donations };
        } catch (e) {
            return fallback;
        }
    }
};
