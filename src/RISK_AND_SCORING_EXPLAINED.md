# Risk and scoring: plain English guide

This document explains how the app scores steps (tiers), how risk is used, and how risk is updated from completed steps so it influences future ones.

---

## 1. The score formula

Each step gets a **score** used to rank and compare steps (e.g. on the Algorithmic Grant tab). The formula is:

**Score = (Impact ÷ Den) × M × N × k × E**

Where:

- **Impact** = Urgency × Breadth × Depth (from the step's impact inputs).
- **Den** = **base cost × risk**. So risk sits in the **denominator**: higher risk → larger Den → lower score.
- **M** = momentum (step 1, 2, or 3).
- **N** = neglectedness.
- **k** = confidence.
- **E** = emergency multiplier (4 if emergency, else 1).

So **risk** is the factor we're talking about: it multiplies the base cost in the denominator. Everything else equal, a step with higher risk gets a **lower** score.

---

## 2. What "risk" means

**Risk** is a number (typically between 1.0 and about 1.6, and ×1.1 if the step has "external dependency"). It represents how much cost and time might overrun compared to plan.

- For steps **not yet started**, the app doesn't know the real risk, so it uses an **estimate** (see section 5).
- For steps **in progress** or **completed**, the app uses a **locked** or **final** value stored on the step (see sections 3 and 4).

---

## 3. Risk at each stage of a step (plain English)

### Backlog (step not started)

The app has no real data for this step yet. It uses an **estimate** based on a single global number called the **learned risk base**. That number starts at **1.0** and is updated over time when you complete steps (see section 5). So for backlog steps, risk = that estimate (and ×1.1 if the step is marked "external dependency").

### When you start the step

When you click **Start** in the Project Queue and confirm in the Start step modal, the app **locks in** the risk estimate that was used at that moment. It saves it on the step as "risk at start." From then on, that step's score always uses this locked value. Starting the step does not change its risk later.

### When you complete the step

After you enter verified costs (and optional proof/notes) and click **Complete**, the app:

1. **Marks the completion date** and computes **actual days** from start to completion (calendar days between "Start" and "Complete").
2. **Computes a final risk** for this step from what actually happened:
   - **Cost overrun** = total verified cost ÷ total planned cost (see section 4).
   - **Time overrun** = actual days ÷ estimated days.
   - Final risk = formula using both overruns (between 1.0 and 1.6, ×1.1 if external dependency).
3. **Saves that final risk** on the step for the record.
4. **Updates the global "learned risk base"**: it takes the current average of past final risks, adds this step's result (without the 1.1 factor), and recomputes the average. So each completion nudges the learned risk up or down.

So: risk is **updated** only when steps **complete**. That update then affects how risk is **estimated** for all steps still in backlog (section 5).

---

## 4. What counts as "cost" (for cost overrun)

Both **planned cost** and **verified cost** are the **full monetary value** of the step:

- **Monetary (material) costs** (from cost types).
- **In-kind labor value** = people × hours × rate.
- **Community labor value** = people × hours × rate.

**Cost overrun** = total verified cost ÷ total planned cost (all three parts). So it is **not** material-only; in-kind and community labor value are included on both sides.

**Time overrun** = actual days (from start to completion) ÷ estimated days (the "Est. days" you set in the Impact section for the step).

---

## 5. How completed tiers' final risk influences new tiers

### The learned risk base

The app keeps a single global number in settings: **learned risk base**. It is a **running average** of the "base" final risk from every completed step (the final risk with the external-dependency 1.1 factor removed). It also keeps **completed steps count** (how many steps have been included in that average).

- When **no** steps have been completed (or after you reset the risk model in Settings), learned risk base = **1.0**.
- Each time you complete a step, the app updates: new average = (old average × count + this step's base risk) ÷ (count + 1), and count increases by one.

### How backlog (new) tiers use it

For any step that is **not yet started**, the app does not use a per-step risk; it uses an **estimate** based on the learned risk base, with a **warm-up** so the first completions don't swing the estimate too much:

- **Blend weight** = completed steps count ÷ 20 (capped at 1).
- **Risk estimate** = (1 − blend) × 1.0 + blend × learned risk base.
  - **0 completions:** risk = **1.0** (pure default).
  - **1–19 completions:** risk **gradually moves** from 1.0 toward the current learned average.
  - **20+ completions:** risk = **learned risk base** (fully the average of past final risks).

If the step is marked "external dependency," this risk is then multiplied by 1.1.

So: **completed tiers' final risk** → updates the **learned risk base** (their average) → that learned risk base (with warm-up) is what sets the **risk** used in the score formula for **new** (backlog) tiers. One shared number for all new steps.

---

## 6. Where this risk appears in the formula

The "risk" we're talking about (the estimate for backlog steps, or the locked/final value for started/completed steps) is exactly the one in the score formula:

**Den = base_cost × risk**  
**Score = (Impact ÷ Den) × M × N × k × E**

So:

- **Higher risk** (e.g. learned risk has gone up after many overruns) → larger Den → **lower scores** for new backlog steps.
- **Lower risk** (e.g. after reset, or few overruns) → smaller Den → **higher scores** for new backlog steps.

For backlog steps, "risk" is the estimate from section 5 (1.0 at the start, then gradually the learned average over the first 20 completions, then fully the learned average). For started or completed steps, "risk" is the value stored on the step (risk at start or final risk).

---

## 7. End-to-end flow (summary)

1. **Create project and add a step** with e.g. **Est. days = 10** (in the Impact section of that step). Save. The app stores planned cost (materials + in-kind + community) and estimated days.
2. **Start the step** (Start button → Start step modal → confirm). The app records the start date and **locks in** the current risk estimate for that step ("risk at start").
3. **Complete the step** (Complete Project → enter verified costs and optional proof/notes → confirm). The app:
   - Records the completion date.
   - Computes **actual days** from start to completion.
   - Computes **final risk** from cost overrun (verified ÷ planned, full value) and time overrun (actual days ÷ est days).
   - Saves final risk on the step.
   - Updates the **learned risk base** (running average of past final risks) and **completed steps count**.
4. **New backlog steps** then use that learned risk (with the 0–20 warm-up blend) as their **risk** in the score formula, so completed tiers' final risk directly influences the scores of new tiers.

All of this is already implemented and functional in the app.
