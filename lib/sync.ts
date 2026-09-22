import "server-only";

import { allResolvedDirectors } from "./directors";
import { QUARTERS } from "./brand";
import {
  assignProjectsExclusiveToTeams,
  buildTeamMembershipLookup,
  clearLiveCaches,
  fetchActiveProjectsForTeam,
  fetchLeadKpiProjectsForTeam,
  fetchProjectsForTeamUserIds,
  filterProjectsToTeamParticipants,
  kpiYear,
  loadTeamBundleFromScoro,
  resolveEscalationsForOrg,
  userIdsForTeam,
  type TeamProjectFetch,
} from "./scoro-live";
import { clearApiCache } from "./scoro-api";
import {
  inactiveFormerMemberEmailsForTeam,
  loadScoroUserGroupIdsByName,
  loadScoroUsersDetailed,
  resolveTeamRosterFromScoro,
  withScoroRoster,
} from "./scoro-roster";
import {
  appendRosterSnapshot,
  rosterEmailsForQuarter,
  userIdsFromEmails,
} from "./roster-history";
import { appendAvailabilitySnapshot } from "./availability-history";
import { mockTeamStats, mockEscalations } from "./mock";
import {
  getCachedDirector,
  setCachedDirector,
  readMeta,
  writeMeta,
  countCachedDirectors,
  isPersistentCacheEnabled,
  getPersistentStoreLabel,
  type DirectorCacheEntry,
} from "./snapshot-cache";
import { syncIntervalDays, syncIntervalMs } from "./sync-schedule";

// ── In-process sync guard (one sync at a time per Node.js instance) ─────────
let syncRunning = false;
let lastSyncPromise: Promise<void> | null = null;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("A dashboard sync is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

export function isSyncRunning(): boolean {
  return syncRunning;
}

export async function getSyncStatus() {
  const meta = await readMeta();
  const directorsCached = await countCachedDirectors();
  const now = Date.now();
  const snapshots = await Promise.all(
    allResolvedDirectors().map(async (director) => {
      const entry = await getCachedDirector(director.id);
      const fetchedAtMs = entry ? new Date(entry.fetchedAt).getTime() : Number.NaN;
      const ageMs = Number.isFinite(fetchedAtMs) ? now - fetchedAtMs : null;
      return {
        director: director.id,
        fetchedAt: entry?.fetchedAt ?? null,
        ageMs,
        overdue: ageMs === null || ageMs >= syncIntervalMs(),
      };
    })
  );
  return {
    running: syncRunning,
    lastSyncAt: meta.lastSyncAt,
    lastSyncDurationMs: meta.lastSyncDurationMs,
    syncError: meta.syncError,
    directorsCached,
    healthy:
      !meta.syncError &&
      directorsCached === snapshots.length &&
      snapshots.every((snapshot) => !snapshot.overdue),
    snapshots,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Trigger helpers ────────────────────────────────────────────────────────

export function triggerSync(
  directorId?: string,
  forceFullRecompute?: boolean
): { started: boolean; message: string } {
  if (syncRunning) {
    return { started: false, message: "Sync already in progress" };
  }
  lastSyncPromise = runSync(directorId, forceFullRecompute).catch((error) => {
    console.error("[sync] Background sync failed:", error);
  });
  return { started: true, message: directorId ? `Sync started for ${directorId}` : "Sync started" };
}

export async function waitForSync(timeoutMs?: number): Promise<void> {
  if (!lastSyncPromise) return;
  if (!timeoutMs) {
    await lastSyncPromise;
    return;
  }
  await Promise.race([
    lastSyncPromise,
    sleep(timeoutMs).then(() => undefined),
  ]);
}

/**
 * Sync all directors one at a time, clearing caches between each.
 * Much more memory-friendly than syncing all at once.
 */
export function triggerSyncSequential(): { started: boolean; message: string } {
  if (syncRunning) {
    return { started: false, message: "Sync already in progress" };
  }
  lastSyncPromise = runSyncSequential().catch((error) => {
    console.error("[sync] Background sequential sync failed:", error);
  });
  return { started: true, message: "Sequential sync started (all directors)" };
}

async function runSyncSequential(): Promise<void> {
  const directors = allResolvedDirectors();
  for (const dir of directors) {
    await runSync(dir.id);
    // Between isolated director syncs, pause for rate limits
    await sleep(1000);
  }
}

// ── Core sync ──────────────────────────────────────────────────────────────

/**
 * Main sync function.
 * Pass a `directorId` to sync a single director (used by Vercel Cron).
 * Omit it to sync all directors sequentially (used locally / manual trigger).
 * Pass `forceFullRecompute: true` to bypass closed-quarter cache reuse for
 * this run — every quarter (not just the currently-open one) is re-derived
 * live from Scoro. Needed because aggregateTimeForTeam otherwise replays a
 * closed quarter's last-cached numerator/denominator forever, even after a
 * logic fix (e.g. widening the roster to include a departed member) — a
 * routine re-sync alone can never correct an already-closed quarter.
 */
export async function runSync(
  directorId?: string,
  forceFullRecompute?: boolean
): Promise<void> {
  if (syncRunning) throw new SyncAlreadyRunningError();
  syncRunning = true;
  const startMs = Date.now();

  const label = directorId ?? "all";
  console.log(`[sync] Starting sync (${label})...`);

  const currentMeta = await readMeta();

  try {
    const canUseScoro = !!(process.env.SCORO_API_KEY && process.env.COMPANY_BASE_URL);

    if (!canUseScoro) {
      console.warn("[sync] No Scoro credentials — writing mock data");
      const directors = allResolvedDirectors().filter(
        (d) => !directorId || d.id === directorId
      );
      for (const dir of directors) {
        await setCachedDirector({
          directorId: dir.id,
          teamStats: dir.teams.map((team) => ({ team, stats: mockTeamStats(dir, team) })),
          escalations: mockEscalations(dir),
          fetchedAt: new Date().toISOString(),
        });
      }
      await writeMeta({
        lastSyncAt: new Date().toISOString(),
        lastSyncDurationMs: Date.now() - startMs,
        syncError: null,
      });
      return;
    }

    console.log("[sync] Loading Scoro users and user groups...");
    const usersDetailed = await loadScoroUsersDetailed();
    const users = usersDetailed.map((u) => ({ id: u.id, email: u.email }));
    const groupIdsByName = await loadScoroUserGroupIdsByName();
    console.log(
      `[sync] Loaded ${users.length} Scoro users, ${groupIdsByName.size} user groups`
    );

    await sleep(300);

    const year = kpiYear();

    // Escalation attribution is org-wide (a task resolves to at most one of
    // the 9 directors, never to a team) — resolve once per sync run rather
    // than re-fetching per director/team.
    console.log("[sync] Resolving escalations org-wide...");
    const escalationsByDirector = await resolveEscalationsForOrg(users, year);
    await sleep(300);

    const prevRosterByTeam =
      currentMeta.rosterHistory?.[currentMeta.rosterHistory.length - 1]?.byTeam ?? {};
    const rosterHistory = appendRosterSnapshot(
      currentMeta.rosterHistory ?? [],
      new Date().toISOString(),
      { ...prevRosterByTeam }
    );
    const rosterIndex = rosterHistory.length - 1;

    // Snapshot every user's live Scoro weekly schedule this sync — see
    // availability-history.ts. Lets target-hour math use the schedule that
    // was actually in effect on each day, so a mid-quarter Scoro schedule
    // change self-corrects on the next sync instead of needing someone to
    // notice and manually recompute past months.
    const availabilityByEmail: Record<string, (typeof usersDetailed)[number]["availability"]> = {};
    for (const u of usersDetailed) {
      if (u.availability) availabilityByEmail[u.email.toLowerCase()] = u.availability;
    }
    const availabilityHistory = appendAvailabilitySnapshot(
      currentMeta.availabilityHistory ?? [],
      new Date().toISOString(),
      availabilityByEmail as Record<string, NonNullable<(typeof usersDetailed)[number]["availability"]>>
    );
    // Excludes the snapshot just appended above (same reasoning as
    // rosterHistory.slice(0, rosterIndex)): "today" is already covered by
    // each member's live m.availability fallback, so only prior snapshots
    // are needed to resolve past days correctly.
    const availabilityHistoryForLookup = availabilityHistory.slice(0, availabilityHistory.length - 1);

    const directors = allResolvedDirectors().filter(
      (d) => !directorId || d.id === directorId
    );

    for (const dir of directors) {
      console.log(`[sync] Processing ${dir.name} (${dir.teams.length} teams)...`);
      const previousEntry = forceFullRecompute ? null : await getCachedDirector(dir.id);
      const previousStatsByTeamCode = new Map(
        (previousEntry?.teamStats ?? []).map((ts) => [ts.team.code, ts.stats])
      );
      const entry: DirectorCacheEntry = {
        directorId: dir.id,
        teamStats: [],
        escalations: [],
        fetchedAt: new Date().toISOString(),
      };

      const fetchFailed = new Set<string>();
      const teamFetches: TeamProjectFetch[] = [];
      const teamLiveByCode = new Map<string, ReturnType<typeof withScoroRoster>>();

      for (const team of dir.teams) {
        const roster = resolveTeamRosterFromScoro(team.code, usersDetailed, groupIdsByName);
        const teamLive = withScoroRoster(team, roster.members);
        teamLiveByCode.set(team.code, teamLive);
        const ids = userIdsForTeam(teamLive, users);
        if (ids.length === 0) continue;
        try {
          const fetched = await fetchProjectsForTeamUserIds(ids);
          const filtered = filterProjectsToTeamParticipants(fetched, ids);
          teamFetches.push({ team: teamLive, userIds: ids, projects: filtered });
        } catch (e) {
          console.warn(`[sync]   projects fetch failed ${team.code}:`, e);
          fetchFailed.add(team.code);
        }
        await sleep(300);
      }

      const assignedExclusive = assignProjectsExclusiveToTeams(teamFetches);

      for (const team of dir.teams) {
        const teamLiveRoster = teamLiveByCode.get(team.code) ?? team;
        rosterHistory[rosterIndex].byTeam[team.code] = teamLiveRoster.members.map((m) =>
          m.email.toLowerCase()
        );

        // People who left the COMPANY (deactivated in Scoro) rather than
        // moved teams — Scoro keeps a deactivated user's group membership
        // intact, so this falls out of live data automatically, no manual
        // mapping edit needed per departure (see Karolina Dubaj / Team 2,
        // 2026-09-21). Merged with mapping.ts's former_member_emails, which
        // still covers JSON-roster teams that have no live Scoro group to
        // read this signal from. Their historical hours should count
        // toward this team's utilization/billable forever, but they must
        // never appear in the roster shown on the dashboard — so this is
        // additive to the wide union / membership bypass below, never to
        // teamLiveRoster.members itself.
        const autoFormerMemberEmails = inactiveFormerMemberEmailsForTeam(
          team.code,
          usersDetailed,
          groupIdsByName
        );
        const formerMemberEmails = [
          ...new Set([...(team.formerMemberEmails ?? []), ...autoFormerMemberEmails]),
        ];
        const teamLive = { ...teamLiveRoster, formerMemberEmails };

        const rosterEmails = new Set<string>(formerMemberEmails.map((e) => e.toLowerCase()));
        for (const q of QUARTERS) {
          for (const e of rosterEmailsForQuarter(
            team.code,
            teamLive.members.map((m) => m.email),
            rosterHistory.slice(0, rosterIndex),
            year,
            q
          )) {
            rosterEmails.add(e);
          }
        }
        const ids = userIdsFromEmails([...rosterEmails], users);
        // Fixes the mover double-count the wide union above deliberately
        // introduces (see buildTeamMembershipLookup) — gates
        // aggregateTimeForTeam's per-day/per-entry classification by
        // whether this person was actually on the team on that date.
        // Former (departed-the-company) members bypass this gate inside
        // aggregateTimeForTeam itself — see teamLive.formerMemberEmails
        // there.
        const membershipLookup = buildTeamMembershipLookup(
          team.code,
          teamLive.members.map((m) => m.email),
          rosterHistory.slice(0, rosterIndex)
        );
        if (ids.length > 0) {
          try {
            const teamProjects = teamFetches.find((f) => f.team.code === team.code)?.projects;
            const projectsForUtilization = fetchFailed.has(team.code)
              ? undefined
              : (assignedExclusive.get(team.code) ?? teamProjects ?? []);
            const leadKpiProjects = await fetchLeadKpiProjectsForTeam(
              teamLive,
              users,
              teamProjects ?? [],
              year
            );
            const activeResult = await fetchActiveProjectsForTeam(
              teamLive,
              users,
              teamProjects ?? []
            );
            const previousStats = previousStatsByTeamCode.get(team.code);
            const stats = await loadTeamBundleFromScoro(
              teamLive,
              ids,
              year,
              users,
              leadKpiProjects,
              projectsForUtilization ?? teamProjects,
              activeResult.projects,
              activeResult.details,
              previousStats && {
                utilization: previousStats.kpiDebug?.utilization ?? {},
                billable: previousStats.kpiDebug?.billable ?? {},
              },
              membershipLookup,
              availabilityHistoryForLookup
            );
            entry.teamStats.push({ team: teamLive, stats });
            console.log(
              `[sync]   ✓ ${team.code} — ${ids.length} users, ${stats.activeProjects} active projects`
            );
          } catch (e) {
            console.warn(`[sync]   ✗ ${team.code} failed:`, e);
            entry.teamStats.push({ team: teamLive, stats: mockTeamStats(dir, teamLive) });
          }
        } else {
          console.warn(`[sync]   ✗ ${team.code} — no matching Scoro users`);
          entry.teamStats.push({ team: teamLive, stats: mockTeamStats(dir, teamLive) });
        }

        // Clear the large per-user API responses (time entries, tasks) that
        // are no longer needed after this team is processed. Project lists
        // are still cached and will be reused across teams in the same director.
        clearApiCache();
        if (typeof global.gc === "function") global.gc();

        await sleep(300);
      }

      entry.escalations = escalationsByDirector.get(dir.email) ?? [];

      await setCachedDirector(entry);
      console.log(`[sync] ✓ ${dir.name} saved to cache`);

      // Free API response cache between directors to avoid OOM on
      // memory-constrained hosts (Render free tier = 256 MB heap).
      clearApiCache();
      if (typeof global.gc === "function") global.gc();

      if (!directorId) {
        await sleep(500);
      }
    }

    await writeMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncDurationMs: Date.now() - startMs,
      syncError: null,
      rosterHistory,
      availabilityHistory,
    });

    if (!isPersistentCacheEnabled()) {
      console.warn(
        "[sync] DATABASE_URL / KV not set — snapshots are file-only and will not persist across deploys"
      );
    } else {
      console.log(
        `[sync] Snapshots persisted to ${getPersistentStoreLabel()} (refresh interval: every ${syncIntervalDays()} days)`
      );
    }

    console.log(
      `[sync] Complete (${label}) — ${((Date.now() - startMs) / 1000).toFixed(1)}s`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync] Fatal error:", msg);
    await writeMeta({
      lastSyncAt: currentMeta.lastSyncAt,
      lastSyncDurationMs: Date.now() - startMs,
      syncError: msg,
    });
    throw e;
  } finally {
    clearApiCache();
    clearLiveCaches();
    if (typeof global.gc === "function") global.gc();
    syncRunning = false;
  }
}
