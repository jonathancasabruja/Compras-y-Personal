# Casa Bruja — Compras & Personal

Purchase orders, cost invoices (fletes + gastos), invoice library,
servicios profesionales / personal eventual. The money-out side of
the ERP.

## Stack
- **React + Vite** (client) · **tRPC + Express** (server) · **Drizzle + Supabase PG**
- Runs on Railway → auto-deploys on push to `main`
- Receives inbound invoices via Postmark email, Twilio WhatsApp, + a folder-drop ingest endpoint

## Entry points
- Server: `server/index.ts` (Express setup, unified auth middleware, tRPC mount, ingestion routes)
- tRPC root: `server/routers.ts`
- Ingest: `server/ingest.ts` (email / whatsapp / folder → `supplier_invoices` + S3)
- Client: `client/src/App.tsx`
- Schema: `drizzle/schema.ts`

## Key subsystems → files
- **OCs (purchase orders)**: `purchase_orders` + `purchase_order_items` + `purchase_order_extra_costs`
- **Cost invoices (fletes + gastos)**: `cost_invoices` + `cost_invoice_allocations`
- **Invoice library / Repositorio**: `supplier_invoices` — AI-categorized (Claude Sonnet 4.5 PDF reader)
- **Supplier product mappings**: `supplier_product_mappings` — learns supplier_part → internal_product_code
- **AI correction chat**: in-drawer + NewPoDialog, saves to `purchase_orders.correction_chat` JSONB
- **Servicios profesionales**: unified with Personal Eventual (merged 2026-04-22)

## Conventions
- **No local TS toolchain.** Don't try `npm run build` locally
- Commits: push to main → Railway auto-deploys (~2min)
- Never commit with `--no-verify` unless explicitly told
- Money formatting: 2 decimals, PAB (Panamanian Balboa = USD)
- AI extraction uses Claude Sonnet 4.5 via `ANTHROPIC_API_KEY` env var

## Auth
- Unified via hub JWT cookie + `cb_session_meta` — see `server/index.ts` `unifiedAuth()` middleware
- Two paths:
  1. Valid JWT cookie → check `permissions._apps.compras` (admin/legacy bypass)
  2. Legacy HTTP Basic Auth with `APP_PASSWORD` (kept for old bookmarks + ingest webhooks)
- Browser 401 → redirect to `hub.casabruja.com/login?next=...`; API 401 → plain 401
- `APP_KEY = "compras"` — used for the section key

## Section permissions (defined, not yet enforced inside routers)
`purchase_orders` · `cost_invoices` · `invoice_library` · `servicios_profesionales`

## Gotchas
- Ingest routes go BEFORE the unified-auth middleware so Postmark/Twilio can reach them with their own `INGEST_SECRET` validation
- `apply_to_purchase_orders` on cost_invoice_allocations flows into the related PO — double-check when editing to avoid orphans
- `markOrdersDelivered` bulk endpoint had an `ANY($1) array` bug — fixed with `string_to_array` workaround
- Detail drawer AI chat + NewPoDialog AI chat share the same corrector pattern; both persist to `correction_chat`

## Recent migrations
- **2026-04-22** — Personal Eventual merged into Servicios Profesionales (single category)
- **2026-04-23** — Unified auth: JWT cookie + per-app permission check replaces HTTP Basic Auth as primary path

## External systems
- Railway (project `industrious-luck`, service `Compras-y-Personal`)
- Supabase PG (project `mcuxvoyrhfwafoxvxinm`)
- Anthropic API (Claude Sonnet 4.5 for PDF extraction + correction chat)
- Postmark (inbound email webhooks) · Twilio (inbound WhatsApp)
- GitHub: `jonathancasabruja/Compras-y-Personal`
