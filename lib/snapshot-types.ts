import type { ResolvedTeam, WeekAvailability } from "./directors";
import type { MockEscalation, TeamStats } from "./mock";

/** One sync's team rosters (emails per team code). */
export type TeamRosterSnapshot = {
  syncedAt: string;
  byTeam: Record<string, string[]>;
};

/** One sync's per-user live Scoro weekly schedule (lowercased email keys). */
export type AvailabilitySnapshot = {
  syncedAt: string;
  byEmail: Record<string, WeekAvailability>;
};

export type DirectorCacheEntry = {
  directorId: string;
  teamStats: { team: ResolvedTeam; stats: TeamStats }[];
  escalations: MockEscalation[];
  fetchedAt: string;
};

export type SyncMeta = {
  lastSyncAt: string | null;
  lastSyncDurationMs: number | null;
  syncError: string | null;
  /** Cached Scoro bookmark id for "All Offer Prep projects" (resolved via user token). */
  offerPrepBookmarkId?: number | null;
  /** Per-sync team membership snapshots for historical headcount / utilization. */
  rosterHistory?: TeamRosterSnapshot[];
  /** Per-sync live Scoro weekly-schedule snapshots — lets target-hour math use
   * the schedule that was actually in effect on each day instead of applying
   * today's live value to the whole quarter. See availability-history.ts. */
  availabilityHistory?: AvailabilitySnapshot[];
};
