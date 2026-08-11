# Admind · Agentic Director Dashboard

Director-only KPI cockpit for Admind, built from the brief in `Agentic dashboard metrics.md` and the Admind visual system in `Dashboard.html`.

**Read [`AGENT.md`](./AGENT.md) before modifying any code.** It is the binding spec.

## Stack

- Next.js 14 (App Router) · React 18 · TypeScript 5
- Tailwind CSS 3 (brand tokens only)
- Google Gemini (`@google/generative-ai`)
- Scoro REST (proxied server-side)

## Run

```bash
npm install
npm run dev
# → http://localhost:3000
```

The `.env` at the workspace root supplies:

```
COMPANY_BASE_URL=https://admindagency.scoro.com/api/v2
SCORO_API_KEY=***
SCORO_COMPANY_ACCOUNT_ID=admindagency   # optional; else parsed from COMPANY_BASE_URL host
KPI_YEAR=2026                           # optional; calendar year for quarters & time filters
KPI_FTA_ENABLED_TEAMS=1,2               # optional; restrict FTA full color to these team codes (`01` = `1`); omit or empty = all teams in color
SCORO_MCP=https://admindagency.scoro.com/mcp
GOOGLE_GEMINI_API_KEY=***
KV_REST_API_URL=***                      # Upstash Redis — required in production for persistent snapshots
KV_REST_API_TOKEN=***
CRON_SECRET=***                          # Bearer token for /api/cron (recommended)
SYNC_INTERVAL_DAYS=3                     # optional; cron + cache TTL (default 3)
```

### Data accuracy and refresh

Current implementation notes:

- Project utilization now excludes Scoro activities under **Internal activities (non billable)** and **Non-billable tasks**, keeps Scrum, and divides by mapped team capacity for elapsed weeks in the quarter. Scoro `timeEntries/list` does not expose project id / budget type, so this is the reliable v2 API approximation until the dashboard can read a dedicated Scoro availability/budget report.
- Escalations are attributed only to teams whose mapped members appear on the Scoro project users list. Team leads are not counted unless they are also listed as members of that team.
- Director snapshots are served from **Upstash Redis** when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set (otherwise local file cache, wiped on deploy). A **cron job every 3 days** refreshes all 9 directors from Scoro into Redis (`vercel.json` on Vercel, `render.yaml` cron on Render). Stale snapshots still render immediately and trigger a director-specific background refresh.
- A database is not required just to make the dashboard reliable. The practical serving model is scheduled Scoro sync -> persisted snapshot -> fast dashboard reads -> visible `updatedAt`/source state. Add a database later for historical trends, audit trails, manual corrections, or report reconciliation.

When `SCORO_API_KEY` and `COMPANY_BASE_URL` are set and the API responds successfully, the header shows **Scoro** and the grid is filled from **live Scoro data**:

| KPI | Source (v1) |
|-----|-------------|
| **Project utilization** | Sum of `duration` on time entries (mapped members, `KPI_YEAR`) ÷ capacity from `mapping_ba_update.json` weekly targets × weeks in each quarter. |
| **Billable hours** | `billable_duration` ÷ `duration` on the same time entries, per quarter. |
| **FTA / estimate / pitch wins / existing wins** | `projects/list` per team (`bookmark_users`). Project KPIs use **exclusive assignment** within each director: the same Scoro job is attributed to one team only (best linked-user overlap, then bookmarks, then stable team-code tie-break) so shared bookmarks do not clone identical % across rows. Then: tags + **Budget Type**; **Projects in estimate** uses `data/budgets.json` (**budgetedSum** / **usedBudget**, etc.) and project cost fields for completed/invoiced work. |
| **Escalations** | Projects carrying an **Escalation** tag (case-insensitive) in `KPI_YEAR`. |

If Scoro is unreachable, keys are missing, or no team member email matches a Scoro user, that team falls back to **zeros** and the header shows **Offline**.

**Refresh:** page loads read the latest persisted snapshot. Cron and on-demand director-specific syncs refresh the snapshot; page rendering does not wait for a full organization-wide Scoro sync.

**Note:** Scoro’s own list limits (e.g. 25 rows per page with `detailed_response` on projects) apply; very large teams may need further pagination or saved views later.

## Routes

| Route | Purpose |
|---|---|
| `/` | Director / group lead picker (9 dashboards) |
| `/dashboard/piotr` | Piotr Wiśniewski · Creative |
| `/dashboard/marta` | Marta Szmyd · Creative |
| `/dashboard/dominika` | Dominika Konieczkowska · Creative |
| `/dashboard/michal` | Michał Majewski · Creative |
| `/dashboard/karolina` | Karolina Pospischil · Strategy |
| `/dashboard/jonattas` | Jonattas Poltronieri · CT |
| `/dashboard/krzysztof` | Krzysztof Wroblewski - Group Lead |
| `/dashboard/maciej` | Maciej Furtak - Group Lead |
| `/dashboard/justyna` | Justyna Dorman - Group Lead |
| `/api/kpis/:id?q=Q2` | JSON KPI snapshot per director |
| `/api/escalations/:id` | Project escalations |
| `/api/agent/insights` | POST — Gemini briefing for one KPI |
| `/api/scoro/*` | Authenticated Scoro REST proxy |

## Keyboard

- `1 / 2 / 3 / 4` — switch quarter
- `Esc` — close drilldown / escalation panel

## Directory

```
app/          pages + API routes (server-only secrets)
components/   UI primitives + dashboard composition
lib/          brand, directors, mapping, Scoro, Gemini, mock
```
