/**
 * Step Scoring Algorithm
 * 
 * Formula: Score = (Impact / Den) × M × N × k × E
 * Where:
 *   Impact = U(u) × B(b) × D(d)
 *   Den = base_cost × Risk
 *   M = Momentum multiplier (step 1/2/3)
 *   N = Neglectedness multiplier
 *   k = Confidence (0.6-1.0)
 *   E = Emergency multiplier (4.0 if verified emergency, else 1.0)
 */

import { SCORE_TABLES } from '../config.js'
import { pb } from '../config.js'

const { U, B, D, N, M } = SCORE_TABLES;

/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Compute Impact = U(u) × B(b) × D(d)
 */
export function computeImpact(tier) {
    const u = clamp(tier.u || 5, 1, 10);
    const b = clamp(tier.b || 3, 1, 5);
    const d = clamp(tier.d || 3, 1, 5);
    
    return U[u] * B[b] * D[d];
}

/**
 * Compute base cost for a tier (sum of all cost components)
 * = monetary costs + in-kind labor value + community labor value
 */
export function computeBaseCost(tier) {
    // Monetary costs
    let monetaryTotal = 0;
    const costs = tier.monetaryCosts;
    if (costs) {
        const costsObj = typeof costs === 'string' ? JSON.parse(costs) : costs;
        monetaryTotal = Object.values(costsObj || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }
    
    // In-kind labor value
    const inkindValue = (tier.inkindPeople || 0) * (tier.inkindHours || 0) * (tier.inkindRate || 0);
    
    // Community labor value
    const communityValue = (tier.communityPeople || 0) * (tier.communityHours || 0) * (tier.communityRate || 0);
    
    return monetaryTotal + inkindValue + communityValue;
}

/**
 * Get the current risk estimate for a NOT_STARTED tier
 * Uses learned risk from history with warm-up blend
 */
export function getRiskEstimate(externalDependency) {
    // Get learned values from settings
    const learnedRiskBase = this.settings.learnedRiskBase || 1.0;
    const completedStepsCount = this.settings.completedStepsCount || 0;
    
    // Warm-up blend: w = clamp(completedSteps / 20, 0, 1)
    const w = clamp(completedStepsCount / 20, 0, 1);
    
    // Blend default (1.0) with learned risk
    const riskBaseEst = (1 - w) * 1.0 + w * learnedRiskBase;
    
    // Apply external dependency multiplier
    return riskBaseEst * (externalDependency ? 1.1 : 1.0);
}

/**
 * Compute final risk after step completion using cost/time overruns
 * Risk = clamp(1 + 0.5*(cost_overrun - 1) + 0.3*(time_overrun - 1), 1, 1.6) × ext_dep_factor
 */
export function computeRiskFinal(tier) {
    const baseCost = computeBaseCost(tier);
    
    // Get final verified costs
    let finalCost = 0;
    const verifiedCosts = tier.verifiedMonetaryCosts;
    if (verifiedCosts) {
        const costsObj = typeof verifiedCosts === 'string' ? JSON.parse(verifiedCosts) : verifiedCosts;
        finalCost = Object.values(costsObj || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }
    // Add verified labor values
    finalCost += (tier.verifiedInkindPeople || 0) * (tier.verifiedInkindHours || 0) * (tier.verifiedInkindRate || 0);
    finalCost += (tier.verifiedCommunityPeople || 0) * (tier.verifiedCommunityHours || 0) * (tier.verifiedCommunityRate || 0);
    
    // If no verified costs, use base cost (no overrun)
    if (finalCost === 0) finalCost = baseCost;
    
    const estDays = tier.estDays || 7;
    const actualDays = tier.actualDays || estDays;
    
    // Calculate overruns
    const costOverrun = baseCost > 0 ? (finalCost / baseCost) : 1.0;
    const timeOverrun = actualDays / estDays;
    
    // Risk formula
    const riskRaw = 1 + 0.5 * (costOverrun - 1) + 0.3 * (timeOverrun - 1);
    let risk = clamp(riskRaw, 1.0, 1.6);
    
    // Apply external dependency
    if (tier.externalDependency) {
        risk *= 1.1;
    }
    
    return risk;
}

/**
 * Compute step score
 * Score = (Impact / Den) × M × N × k × E
 */
export function computeStepScore(tier, useLockedRisk = false) {
    const impact = computeImpact(tier);
    const baseCost = computeBaseCost(tier);
    
    // Emergency multiplier
    const E = tier.emergency ? 4.0 : 1.0;
    
    // Momentum multiplier (cap at step 3)
    const stepNo = Math.min(tier.level || 1, 3);
    const momentum = M[stepNo];
    
    // Neglectedness multiplier
    const n = clamp(tier.n || 3, 1, 5);
    const neglectedness = N[n];
    
    // Confidence
    const k = clamp(tier.k || 0.9, 0.6, 1.0);
    
    // Determine risk based on tier status
    let risk;
    if (tier.status === 'completed' && tier.riskFinal) {
        risk = tier.riskFinal;
    } else if (tier.status === 'in_progress' && tier.riskEstAtStart) {
        risk = tier.riskEstAtStart;
    } else if (useLockedRisk && tier.riskEstAtStart) {
        risk = tier.riskEstAtStart;
    } else {
        risk = this.getRiskEstimate(tier.externalDependency);
    }
    
    // Denominator
    const den = baseCost * risk;
    
    // No score when there are no costs (formula divides by baseCost)
    if (den <= 0) return null;
    
    // Final score (multiplied by 100 for readability)
    return (impact / den) * momentum * neglectedness * k * E * 100;
}

/**
 * Get the eligible (rankable) step for a project
 * Returns the first incomplete step (backlog status)
 * Steps must be done in order, so only the next incomplete step is eligible
 */
export function getEligibleStep(project) {
    if (!project.tiers || project.tiers.length === 0) return null;
    
    // Sort tiers by level
    const sortedTiers = [...project.tiers].sort((a, b) => a.level - b.level);
    
    // Find the first tier that is not completed
    for (const tier of sortedTiers) {
        if (tier.status !== 'completed') {
            return tier;
        }
    }
    
    // All tiers completed
    return null;
}

/**
 * Check if a tier is eligible for ranking
 * A tier is eligible if it's the first incomplete tier of its project
 */
export function isTierEligible(tier, project) {
    const eligible = this.getEligibleStep(project);
    return eligible && eligible.id === tier.id;
}

/**
 * Update risk learning model after step completion
 * Stores the risk_base_final and updates learned values in settings
 */
export async function updateRiskLearning(tier) {
    if (!tier.riskFinal) return;
    
    // Compute risk_base_final (remove external dependency factor)
    const riskBaseFinal = tier.riskFinal / (tier.externalDependency ? 1.1 : 1.0);
    
    // Get current values
    const currentCount = this.settings.completedStepsCount || 0;
    const currentLearned = this.settings.learnedRiskBase || 1.0;
    
    // Incremental update: exponential moving average
    // New learned = (old * count + new) / (count + 1)
    // This approximates the median behavior for reasonable distributions
    const newCount = currentCount + 1;
    const newLearned = (currentLearned * currentCount + riskBaseFinal) / newCount;
    
    // Update settings
    this.settings.learnedRiskBase = newLearned;
    this.settings.completedStepsCount = newCount;
    
    // Save to database
    try {
        if (this.settingsId) {
            await pb.collection('settings').update(this.settingsId, {
                learnedRiskBase: newLearned,
                completedStepsCount: newCount
            });
            // Optional: log system-side risk model update (plan: Automatic optional to log)
            if (typeof this.logAction === 'function') {
                const userName = this.getCurrentUserName();
                this.logAction(`${userName} completed a step; risk model was updated`);
            }
        }
    } catch (error) {
        console.error('Error updating risk learning:', error);
    }
}

/**
 * Get all score components for display
 */
export function getScoreBreakdown(tier) {
    const u = clamp(tier.u || 5, 1, 10);
    const b = clamp(tier.b || 3, 1, 5);
    const d = clamp(tier.d || 3, 1, 5);
    const n = clamp(tier.n || 3, 1, 5);
    const k = clamp(tier.k || 0.9, 0.6, 1.0);
    const stepNo = Math.min(tier.level || 1, 3);
    
    const impact = computeImpact(tier);
    const baseCost = computeBaseCost(tier);
    
    let risk;
    if (tier.status === 'completed' && tier.riskFinal) {
        risk = tier.riskFinal;
    } else if (tier.status === 'in_progress' && tier.riskEstAtStart) {
        risk = tier.riskEstAtStart;
    } else {
        risk = this.getRiskEstimate(tier.externalDependency);
    }
    
    const den = baseCost * risk;
    const score = this.computeStepScore(tier);
    
    return {
        // Raw inputs
        u, b, d, n, k,
        emergency: tier.emergency || false,
        externalDependency: tier.externalDependency || false,
        estDays: tier.estDays || 7,
        
        // Lookup weights
        Uu: U[u],
        Bb: B[b],
        Dd: D[d],
        Nn: N[n],
        Ms: M[stepNo],
        E: tier.emergency ? 4.0 : 1.0,
        
        // Computed values
        impact,
        baseCost,
        risk,
        den,
        score
    };
}
