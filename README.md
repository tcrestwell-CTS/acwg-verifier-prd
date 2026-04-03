# ACWG Verifier

Sales Rep Validation Portal for fraud prevention — built for Crestwell Getaways / ACWG.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** — custom design system
- **React Hook Form + Zod** — schema-based validation
- **TanStack Query** — API state management
- **MSW (Mock Service Worker)** — fully mocked API layer

---

## Setup

```bash
npm install
npm run msw:init     # generates public/mockServiceWorker.js (required for MSW)
npm run dev          # → http://localhost:3000
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (MSW active in browser) |
| `npm run build` | Production build |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint |
| `npm run msw:init` | Initialize MSW service worker in `/public` |

---

## Pages

| Route | Description |
|---|---|
| `/orders/new` | Order intake form → verification → decision |
| `/orders/queue` | All orders with filters and pagination |
| `/orders/:id` | Order detail, audit history, actions |

---

## MSW Mock API

All API calls are intercepted by MSW. No real backend required.

| Endpoint | Description |
|---|---|
| `POST /api/verify` | Runs deterministic risk checks on order payload |
| `POST /api/decision` | Records an Approve/Queue/Deny decision |
| `GET /api/orders` | Lists all orders (supports `?status=queued`) |
| `GET /api/orders/:id` | Fetches single order + verification + history |
| `POST /api/ai/explain` | Generates rep-facing risk summary |
| `POST /api/ai/message` | Generates customer-facing message template |

**To toggle MSW off** (e.g., to wire real API routes): remove or comment out the `useEffect` MSW init block in `app/layout.tsx`.

---

## Risk Scoring Logic

Scores are computed in `lib/risk.ts` — purely deterministic, AI is never the decision-maker.

| Signal | Points |
|---|---|
| Address DPV non-Y | +20 |
| Billing/shipping > 500km | +15 |
| VoIP phone | +10 |
| Inactive phone | +10 |
| Disposable email | +15 |
| Invalid MX records | +10 |
| AVS N or U | +25 |
| CVV N or U | +10 |
| Prepaid card BIN | +10 |
| Proxy/VPN IP | +15 |
| IP > 800km from shipping | +10 |

**Score → Decision:** ≤25 = Approved · 26–60 = Queued · >60 = Denied

---

## Fixture Orders (pre-loaded in MSW)

| ID | Customer | Score | Decision |
|---|---|---|---|
| `ord_001` | Sarah Mitchell | 0 | Approved |
| `ord_002` | Derek Okafor | 40 | Queued |
| `ord_003` | Alex Rivera | 95 | Denied |

---

## Future: Real Claude Integration

`ClaudeSummary.tsx` currently calls `/api/ai/explain` and `/api/ai/message` (MSW-mocked). To wire real Claude:

1. Add `ANTHROPIC_API_KEY` to `.env.local`
2. Create `app/api/ai/explain/route.ts` calling Anthropic SDK
3. Remove the MSW handlers for those two routes

---

## Project Structure

```
app/
  layout.tsx              Root layout + NavBar + MSW init
  orders/
    new/page.tsx          Intake form → verify → decide
    queue/page.tsx        Queue listing
    [id]/page.tsx         Order detail + audit log

components/
  OrderForm.tsx           Full intake form (RHF + Zod)
  VerificationPanel/      5 collapsible check sections
  RiskSummary.tsx         Score bar + action buttons
  DecisionModal.tsx       Approve/Queue/Deny with audit
  ClaudeSummary.tsx       Rep + customer AI tabs
  QueueTable.tsx          Paginated, filterable table
  ui/                     Badge, Toast, Modal, Spinner

lib/
  schemas.ts              All Zod schemas + TS types
  risk.ts                 Scoring engine + constants
  format.ts               Phone/state/ZIP normalizers

mocks/
  fixtures.ts             3 pre-built realistic orders
  handlers.ts             All MSW request handlers
  browser.ts              MSW browser worker

tests/
  unit/risk.test.ts       9 scoring tests
  unit/schemas.test.ts    7 validation tests
  unit/format.test.ts     9 formatter tests
```
