import type { WeekAvailability } from "./directors";
import type { AvailabilitySnapshot } from "./snapshot-types";

export type { AvailabilitySnapshot };

const MAX_SNAPSHOTS = 120;

const fullDay = (hours: number): WeekAvailability => ({
  monday: hours * 3600,
  tuesday: hours * 3600,
  wednesday: hours * 3600,
  thursday: hours * 3600,
  friday: hours * 3600,
  saturday: 0,
  sunday: 0,
});

/**
 * Manually-confirmed historical schedule facts that predate this feature's
 * rollout (2026-09-22) — a narrow, explicit data-entry escape hatch, not a
 * general historical-backfill mechanism. Sync-recorded snapshots (see
 * appendAvailabilitySnapshot) only start from whenever this feature first
 * ran, so without an entry here, a change that already happened before that
 * (like this one) would still misreport every quarter it touches using a
 * single flat value.
 *
 * Confirmed live 2026-09-22: with no entry here, Team 2's Q2 utilization
 * read 86% (billable 78%) because Hristina's *current* 4h/day was applied
 * flat across the whole year, understating her real target hours for the
 * months she was actually full-time. With this entry, Q2 correctly reads
 * 78% (billable 71%) — an 8-point swing large enough to change whether the
 * team is read as meeting its KPI. Deliberately not extended to other, much
 * smaller cases from the same review (Olga Shikhova's 7h→8h bump for a
 * single month; mid-quarter team joins) — see conversation 2026-09-22.
 */
const KNOWN_HISTORICAL_SNAPSHOTS: AvailabilitySnapshot[] = [
  {
    syncedAt: "2026-01-01T00:00:00.000Z",
    byEmail: { "hristina.gjorgijevska@admindagency.com": fullDay(8) },
  },
  {
    syncedAt: "2026-09-01T00:00:00.000Z",
    byEmail: { "hristina.gjorgijevska@admindagency.com": fullDay(4) },
  },
];

/** Append this sync's live per-user schedules; trim oldest entries. */
export function appendAvailabilitySnapshot(
  history: AvailabilitySnapshot[],
  syncedAt: string,
  byEmail: Record<string, WeekAvailability>
): AvailabilitySnapshot[] {
  const next = [...history, { syncedAt, byEmail }];
  if (next.length <= MAX_SNAPSHOTS) return next;
  return next.slice(next.length - MAX_SNAPSHOTS);
}

/**
 * The weekly schedule in effect for `email` on `dateIso`, per
 * KNOWN_HISTORICAL_SNAPSHOTS followed by the sync-recorded snapshot history
 * — i.e. the schedule captured by the most recent snapshot at or before
 * that date. Returns undefined when no snapshot at or before dateIso has an
 * entry for this person (e.g. a date predating both the known-facts seed
 * and this feature's rollout, or a brand-new hire not yet seen by a sync);
 * callers should fall back to the member's current live availability in
 * that case, same as before this lookup existed.
 *
 * This is what makes a mid-quarter Scoro schedule change (e.g. someone
 * dropping from 8h to 6h/day) self-correcting: the next sync records the new
 * value dated that day, so days before the change keep using the old
 * snapshot and days from the change onward automatically pick up the new
 * one — no manual re-derivation of past months needed, and nothing to
 * remember to go check by hand.
 */
export function weeklyAvailabilityForDate(
  email: string,
  dateIso: string,
  history: AvailabilitySnapshot[]
): WeekAvailability | undefined {
  const e = email.toLowerCase();
  // No early-break on date order here: KNOWN_HISTORICAL_SNAPSHOTS (dated
  // 2026-01-01 / 2026-09-01) is prepended ahead of whatever the caller
  // passes, which is not guaranteed to interleave in ascending order with
  // it — a full scan keeping the latest-dated match is the only way to
  // stay correct regardless of the two arrays' relative dates.
  let result: WeekAvailability | undefined;
  let resultDate = "";
  for (const snap of [...KNOWN_HISTORICAL_SNAPSHOTS, ...history]) {
    const day = snap.syncedAt.slice(0, 10);
    if (day > dateIso) continue;
    const avail = snap.byEmail[e];
    if (avail && day >= resultDate) {
      result = avail;
      resultDate = day;
    }
  }
  return result;
}
