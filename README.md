# Aurora GM — Grants Management

A comprehensive grants management platform for community-driven organizations, with project scoring, step-based lifecycles, budget tracking, and interactive dashboards.

Originally built by [CoFinca Aurora](https://www.cofincaurora.org) for managing community grants in rural Panama.

---

## Features

### Homepage
- Animated pixel forest hero section with parallax scrolling
- Collapsible content sections with smooth transitions
- Interactive maps showing project locations
- Responsive layout for all screen sizes

### Grants Lifecycle
- Step-based project lifecycle management (application through completion)
- Configurable scoring algorithm for project evaluation
- Compassion/empathy-based grant allocation system
- Per-step budget tracking and reporting
- Donor management and contribution tracking

### Dashboard
- Chart.js-powered analytics (bar, pie, line, doughnut)
- Google Maps integration with project location markers
- Real-time data from PocketBase subscriptions
- Summary cards with key metrics

### AI and Productivity
- AI chat assistant for grant-related queries
- AI-powered step completion report generation

### User Experience
- Multilingual support (English / Spanish) via vue-i18n
- Lazy-loading and pagination for large datasets
- Mobile-first responsive design
- PWA-ready architecture

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Framework  | Vue 3 (Composition API)           |
| Styling    | Tailwind CSS (CDN)                |
| Backend    | PocketBase                        |
| Build      | Vite                              |
| Maps       | Google Maps JavaScript API        |
| Charts     | Chart.js                          |
| i18n       | vue-i18n                          |

---

## Quick Start

```bash
git clone https://github.com/nicolazza/aurora-gm.git
cd aurora-gm
npm install
cp .env.example .env
```

Add your Google Maps API key to `index.html`:

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places"></script>
```

Configure your `.env` with the PocketBase URL:

```
VITE_PB_URL=http://127.0.0.1:8090
```

Start PocketBase (see [aurora-pocketbase](#pocketbase-setup)), then:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## PocketBase Setup

Aurora GM requires a running PocketBase instance with the Aurora schema and hooks. See the [aurora-pocketbase](https://github.com/nicolazza/aurora-pocketbase) repository for full setup instructions, hook descriptions, and collection details.

---

## Cross-App Integration

Aurora GM is part of a four-app ecosystem. It can run standalone or integrate with its sibling apps for richer functionality.

### Finance Manager (aurora-fm)

The budget page reads from FM collections to display financial data alongside grant steps:

- `fm_transactions` — income and expense records tied to grant tiers
- `fm_labor_logs` — in-kind and community labor contributions
- `fm_wallets` — wallet balances for grant-dedicated funds

### Project Manager (aurora-pm)

Step modals pull data from PM collections for task tracking and discussions:

- `pm_cards` — linked task cards for each grant step
- `pm_threads` — threaded discussions on step progress
- `pm_gm_metadata` — scoring, status, and checklist data mirrored from GM

### Running Standalone

To use Aurora GM without the other apps:

1. Remove or disable the budget page queries that reference `fm_transactions`, `fm_labor_logs`, and `fm_wallets`.
2. Remove the PM mirror modal code that reads from `pm_cards`, `pm_threads`, and `pm_gm_metadata`.

The core grants lifecycle, scoring, and dashboard features work independently.

---

## Sibling Repositories

| App | Description |
|-----|-------------|
| [aurora-fm](https://github.com/nicolazza/aurora-fm) | Finance Manager — multi-wallet income/expense tracking |
| [aurora-pm](https://github.com/nicolazza/aurora-pm) | Project Manager — kanban boards, Gantt charts, and automations |
| [aurora-pocketbase](https://github.com/nicolazza/aurora-pocketbase) | Shared PocketBase backend hooks and schema |

---

## License

[MIT](LICENSE)
