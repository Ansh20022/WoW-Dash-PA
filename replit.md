# Private Assets · WoW

Invitation-only web dashboard preserving the supplied Private Assets weekly finance analysis and supporting validated SharePoint refreshes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `SHAREPOINT_FOLDER_URL` — configured WoW Analysis folder link, server-only.
- `DASHBOARD_ADMIN_USER_ID` — owner's authenticated account ID. Access fails closed until set; never grant ownership to the first visitor.
- Python 3.13 and pandas are managed in `pyproject.toml` / `uv.lock`. They are required for source refreshes.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pa-wow` — login gate, report host, source status and colleague access pages.
- `artifacts/api-server/resources` — private bundled snapshot, original calculation script and report templates. Never expose via static hosting.
- `artifacts/api-server/src/lib/dashboard-*` — validated analytical cache, refresh and report rendering.
- `lib/db/src/schema` — identity sessions, invitation grants and analytical cache.

## Architecture decisions

- Retain the supplied Python calculation and HTML reporting logic rather than porting it: subtle quarter, forecast-category and bridge semantics must remain consistent.
- SharePoint remains the source of record. Downloads and calculation files are temporary; only computed analytical data and provenance are cached in PostgreSQL.
- A failed calculation never replaces the last validated snapshot. Missing quarterly EDWH references are marked unavailable, not displayed as zero targets.
- No remote Python or HTML is executed; remote content is limited to CSV extracts and reference JSON.

## Product

Report filters, drill-downs and spreadsheet export from the original dashboard; source provenance and reconciliation output; owner-controlled invitation grants/revocations; manual source refresh and optional 5/15-minute refresh while the owner has the report open.

## User preferences

See the project memory index for the user's source and access requirements.

## Gotchas

- Restrict private resources in every Vite service, including the mockup sandbox. Workspace-root file serving otherwise bypasses API authentication.
- SharePoint uses site-selected permissions. A successful site metadata lookup does not establish permission to read its files.
- Uploaded snapshots must never be described as a live SharePoint sync.
- Publishing must retain Python dependencies, the server resources directory and the owner ID environment setting. Production schema is managed by the Publish flow, not startup-time DDL.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
