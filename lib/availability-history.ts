import type { WeekAvailability } from "./directors";
import type { AvailabilitySnapshot } from "./snapshot-types";

export type { AvailabilitySnapshot };

const MAX_SNAPSHOTS = 120;

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
 * The weekly schedule in effect for `email` on `dateIso`, per the snapshot
 * history — i.e. the schedule captured by the most recent sync at or before
 * that date. Returns undefined when no snapshot at or before dateIso has an
 * entry for this person (e.g. a date predating this feature's rollout, or a
 * brand-new hire not yet seen by a sync); callers should fall back to the
 * member's current live availability in that case, same as before this
 * lookup existed.
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
  let result: WeekAvailability | undefined;
  for (const snap of history) {
    if (snap.syncedAt.slice(0, 10) > dateIso) break;
    const avail = snap.byEmail[e];
    if (avail) result = avail;
  }
  return result;
}
