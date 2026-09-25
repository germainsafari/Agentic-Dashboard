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
  // NOTE: Jakub Łodej and Marcin Krokosz (Team FE) were investigated for
  // this same treatment on 2026-09-25 — their Jan-Mar logged hours sat
  // below their current flat 8h/day live schedule, matching the pattern
  // that fixed Hristina above. But the user confirmed directly that both
  // were always full-time 8h/day; the shortfall is normal under-logging
  // (worked but not fully logged), not a real historical schedule
  // difference. No entry added for them — this is deliberately left as a
  // documented negative result: logged-hours-shortfall alone is NOT
  // sufficient evidence of a schedule change, only a signal worth
  // checking against a real, authoritative source before seeding.
  //
  // Real per-month GROSS availability for 16 departed members, replacing
  // scoro-live.ts's flat LEAVER_DEFAULT_WEEKLY_TARGET_HOURS=40 (and its
  // narrower single-average fallback, KNOWN_LEAVER_WEEKLY_TARGETS) for
  // exactly these people/months. A departed member's live Scoro schedule
  // is typically zeroed out post-departure, so there's no live signal to
  // read their real rate from, and a single flat average across someone's
  // whole tenure systematically over/undershoots any specific quarter when
  // their real hours trended up or down toward departure.
  //
  // Each value is `(that person's real logged hours that month + their
  // real booked absence hours that month, restricted to weekdays and
  // deduplicated per day exactly like the app's own absence loop) / real
  // weekdays that month`, capped at 8h/day — i.e. entirely reconstructed
  // from Scoro's own live time-entry and time-off records, the same two
  // sources the app already treats as authoritative for everyone else.
  //
  // This intentionally does NOT use Traffic Management's monthly
  // reconciliation spreadsheets as an input, even though they were the
  // starting point for finding these 16 people — confirmed live
  // 2026-09-25 that the spreadsheet's "target" column can be out of sync
  // with Scoro's own live absence records (Szymon Skrzypczak's February:
  // the spreadsheet's own "Nieobecnosci" tracking sheet shows zero
  // recorded absence that month, while Scoro shows a real Feb 5 vacation
  // day — meaning the spreadsheet's target already silently assumed a
  // full month there). Reconstructing gross availability from two
  // internally-consistent Scoro sources (logged + absence) instead of one
  // Scoro source plus one possibly-stale spreadsheet source removes that
  // cross-system disagreement entirely, rather than trying to detect and
  // special-case each instance of it.
  //
  // Weekdays-only matters because a continuous leave (e.g. a month-long
  // vacation) is stored in Scoro as one entry per CALENDAR day including
  // Saturdays/Sundays, but scheduledSecondsForDay is always 0 on weekends
  // so the real absence loop's Math.min(claimed, scheduled) already zeroes
  // those out — counting them here would double what the app itself ever
  // actually claims. Confirmed live 2026-09-25 (flagged by the user):
  // Magdalena Kotlarek's April "vacation" record spans Apr 2-30 including
  // every weekend day, all value:-1; counting weekends inflated her
  // computed absence to 232h in a month with only 176h of possible
  // weekday hours. The remaining 8h/day cap only absorbs a handful of
  // much smaller residuals (≤0.7h/day over) — plausible normal logging
  // noise, not a real >8h/day schedule.
  //
  // Jan/Feb/Mar 2026 entries for people whose team is one of the 22 covered
  // by q1-2026-hardcoded-kpis.ts were removed 2026-09-25: Q1 for those teams
  // is now hardcoded from the spreadsheets and never reaches the per-day
  // availability loop that would read these, so the entries were dead code.
  // Kept only for igor.kurylak, per the user 2026-09-25 ("skip") — his team
  // wasn't confirmed, so it's not known whether his entries are affected.
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "hanna.pitala@admindagency.com": fullDay(1.5227) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "hanna.pitala@admindagency.com": fullDay(7.619) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "hanna.pitala@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "hanna.pitala@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-01-01T00:00:00.000Z", byEmail: { "igor.kurylak@admindagency.com": fullDay(0.0795) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "viktoria.mandych@admindagency.com": fullDay(0.1818) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "viktoria.mandych@admindagency.com": fullDay(0.25) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "viktoria.mandych@admindagency.com": fullDay(0.25) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "magdalena.kotlarek@admindagency.com": fullDay(7.9773) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "anna.skiba@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "anna.skiba@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "anna.skiba@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "dominik.wycislo@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "dominik.wycislo@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "dominik.wycislo@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "dominik.wycislo@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "piotr.gromniak@admindagency.com": fullDay(7.6932) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "piotr.gromniak@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "piotr.gromniak@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "piotr.gromniak@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "andrzej.firlet@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "andrzej.firlet@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "andrzej.firlet@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "andrzej.firlet@admindagency.com": fullDay(7.7065) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "malwina.tuchendler@admindagency.com": fullDay(7.2991) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "malwina.tuchendler@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "malwina.tuchendler@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "malwina.tuchendler@admindagency.com": fullDay(6.9204) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "szymon.skrzypczak@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "szymon.skrzypczak@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "szymon.skrzypczak@admindagency.com": fullDay(3.7727) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "karolina.dubaj@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "karolina.dubaj@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "karolina.dubaj@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "karolina.dubaj@admindagency.com": fullDay(0.4457) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "gabriela.baka@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "gabriela.baka@admindagency.com": fullDay(6.099) } },
  { syncedAt: "2026-04-01T00:00:00.000Z", byEmail: { "michal.wojtunik@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-05-01T00:00:00.000Z", byEmail: { "michal.wojtunik@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-06-01T00:00:00.000Z", byEmail: { "michal.wojtunik@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-07-01T00:00:00.000Z", byEmail: { "michal.wojtunik@admindagency.com": fullDay(8) } },
  { syncedAt: "2026-08-01T00:00:00.000Z", byEmail: { "michal.wojtunik@admindagency.com": fullDay(0.8571) } },
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
