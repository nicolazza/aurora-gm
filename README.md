# Aurora GM -- Grants Management

A comprehensive grants management platform for community-driven organizations. Provides project scoring, step-based lifecycles, two-phase grant allocation, budget tracking, donor management, and interactive dashboards with maps and analytics.

Originally built by [CoFinca Aurora](https://www.cofincaurora.org) for managing community grants in rural Panama.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [PocketBase Setup](#pocketbase-setup)
- [Cross-App Integration](#cross-app-integration)
- [Sibling Repositories](#sibling-repositories)
- [License](#license)

---

## Features

### Homepage

- Animated pixel forest hero section with parallax scrolling
- 4 collapsible content sections with slide transitions
- Icon carousel call-to-action section
- Hero stats with count-up animation
- Responsive layout across all screen sizes

### Project Lifecycle

- Step-based project lifecycle management
  - States: **Backlog** → **In Progress** → **Completed**
  - Each project contains ordered steps; each step has its own budget, proof requirements, and status
- Configurable project categories
  - Custom colors and bilingual names (English / Spanish)
- Project scoring algorithm
  - Formula: `(Impact / Cost) x Multipliers x 100`
  - Multipliers are configurable per category and project attributes
- Risk model with learned parameters
  - `riskEstAtStart` -- initial risk estimate
  - `riskFinal` -- actual risk at completion
  - `learnedRiskBase` -- rolling average used to refine future estimates
- Two-phase grant allocation
  - **Compassion phase** (85%) -- algorithm-driven selection based on project scores
  - **Empathy phase** (15%) -- manual picks for low-score projects that merit support
- Budget nudge system for near-threshold projects
- Step completion workflow
  - FM transaction verification
  - Labor verification
  - Configurable proof requirements per step
- Project timeline modal with Gantt-style step visualization
- Scholarship management
  - Fixed cost and in-kind value tracking
  - Start and end dates
  - Feedback collection

### Financial Integration

- Per-step monetary budget tracking by cost type
- In-kind and community labor hour tracking with rate-based valuation
- Donor management
  - Full CRUD operations
  - Contribution history
  - Labor log linking
- Step donations tracking
  - Cash, discount, third-party, in-kind service, and in-kind product types
- Budget reconciliation with FM import modal
- GM budget events feed (audit log of budget changes)
- All Transactions table
  - Monetary and labor entries merged into a single view
  - Sorted by date

### Dashboard

- 6-tab dashboard layout

| Tab | Contents |
|-----|----------|
| At a Glance | Summary cards, animated hero numbers, key metrics |
| Financial | Budget breakdowns, spending by cost type, donation totals |
| Projects | Project status distribution, category breakdowns |
| Impact | Impact metrics, community reach, risk analysis |
| Algorithm | Score distributions, threshold visualization, allocation results |
| Activity | Recent events, logbook entries, timeline |

- Chart.js analytics
  - Bar, pie, line, doughnut, scatter, and radar chart types
- Google Maps integration
  - Project markers color-coded by status
  - Filterable by category and status
- Summary cards with animated hero numbers

### Project Views

- **Completed** and **Backlog** tabs with category filter pills
- Card and table view modes
- Interactive map with project markers
- Project search and sorting
  - Sort by: score, newest, oldest, cost, status
- Project info modal with sidebar tabs:
  - **Overview** -- project details, scoring breakdown, risk data
  - **Gallery** -- project photos with lightbox
  - **Attachments** -- uploaded documents and files
- Step management modal with sidebar tabs:
  - **Overview** -- step details, status, proof requirements
  - **Gallery** -- step-level photos
  - **Finance** -- budget by cost type, labor hours
  - **Donations** -- step donation records
  - **Sales** -- sales/revenue entries
  - **Attachments** -- step documents
  - **Interventions** -- completed step interventions

### Operations

- Research import from PM
  - Confirmed research lists are converted into GM projects
- Logbook
  - Date, user, and event type filtering
  - CSV export
- Cost type configuration (manage budget categories)
- Algorithm threshold tuning (adjust compassion/empathy split and score cutoffs)
- Theme customization
  - Header color, button colors, cost type colors, tier colors
- Error logging (client-side error capture)
- Lazy-loading per view and pagination for heavy tables

### Auth and Access

- Username/password authentication with 2FA support
- Guest/public access mode (read-only browsing without login)
- Role-based permissions
- Bilingual UI (English / Spanish) via vue-i18n

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Vue 3 (Composition API) |
| Styling | Tailwind CSS (CDN) |
| Backend | PocketBase |
| Build | Vite |
| Maps | Google Maps JavaScript API |
| Charts | Chart.js |
| i18n | vue-i18n |
| Sanitization | DOMPurify |

---

## Quick Start

```bash
git clone https://github.com/nicolazza/aurora-gm.git
cd aurora-gm
npm install
cp .env.example .env
```

Configure `.env` with your PocketBase URL:

```
VITE_PB_URL=http://127.0.0.1:8090
```

Add your Google Maps API key to `index.html`:

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places"></script>
```

Start PocketBase (see [aurora-pocketbase](https://github.com/nicolazza/aurora-pocketbase) for setup), then run the dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Output is written to `dist/`. Serve with any static file host.

---

## PocketBase Setup

Aurora GM requires a running PocketBase instance with the Aurora schema and hooks. See the [aurora-pocketbase](https://github.com/nicolazza/aurora-pocketbase) repository for:

- Hook installation and configuration
- Collection schema details
- Environment variable reference
- Required vs optional hooks

---

## Cross-App Integration

Aurora GM is part of a four-app ecosystem. It can run standalone or integrate with its sibling apps for richer functionality.

### Finance Manager (aurora-fm)

The budget page reads from FM collections to display financial data alongside grant steps:

- `fm_transactions` -- income and expense records tied to grant tiers via `gm_tier`
- `fm_labor_logs` -- in-kind and community labor contributions with donor tracking
- `fm_wallets` -- wallet balances for grant-dedicated funds (filtered by `is_gm_wallet`)
- `fm_wallet_categories` -- cost type sync between FM categories and GM `cost_types`

### Project Manager (aurora-pm)

Step modals pull data from PM collections for task tracking and discussions:

- `pm_cards` -- linked task cards for each grant step
- `pm_threads` -- threaded discussions on step progress
- `pm_gm_metadata` -- scoring, status, and checklist data mirrored from GM
- `pm_interventions` -- intervention records for completed steps

### Running Standalone

To use Aurora GM without the other apps:

1. Remove or disable budget page queries that reference `fm_transactions`, `fm_labor_logs`, and `fm_wallets`.
2. Remove PM mirror modal code that reads from `pm_cards`, `pm_threads`, and `pm_gm_metadata`.
3. Core grants lifecycle, scoring, dashboard, and donor management features work independently.

---

## Sibling Repositories

| App | Description |
|-----|-------------|
| [aurora-fm](https://github.com/nicolazza/aurora-fm) | Finance Manager -- multi-wallet income/expense tracking with labor logs |
| [aurora-pm](https://github.com/nicolazza/aurora-pm) | Project Manager -- kanban boards, Gantt charts, automations, and mind maps |
| [aurora-pocketbase](https://github.com/nicolazza/aurora-pocketbase) | Shared PocketBase backend with hooks and schema |

---

## License

[MIT](LICENSE)
