import { describe, expect, it } from "vitest";
import { appendAvailabilitySnapshot, weeklyAvailabilityForDate } from "./availability-history";
import type { WeekAvailability } from "./directors";

const fullTime: WeekAvailability = {
  monday: 8 * 3600,
  tuesday: 8 * 3600,
  wednesday: 8 * 3600,
  thursday: 8 * 3600,
  friday: 8 * 3600,
  saturday: 0,
  sunday: 0,
};

const halfDay: WeekAvailability = {
  monday: 4 * 3600,
  tuesday: 4 * 3600,
  wednesday: 4 * 3600,
  thursday: 4 * 3600,
  friday: 4 * 3600,
  saturday: 0,
  sunday: 0,
};

describe("weeklyAvailabilityForDate", () => {
  it("resolves a real mid-quarter schedule change on both sides of the transition (Hristina: 8h/day through August, 4h/day from September)", () => {
    const history = appendAvailabilitySnapshot(
      appendAvailabilitySnapshot([], "2026-08-01T00:00:00.000Z", {
        "hristina@admindagency.com": fullTime,
      }),
      "2026-09-01T00:00:00.000Z",
      { "hristina@admindagency.com": halfDay }
    );

    // An August day still resolves to the pre-change full-time schedule.
    expect(weeklyAvailabilityForDate("hristina@admindagency.com", "2026-08-15", history)).toEqual(
      fullTime
    );
    // A September day picks up the new half-day schedule automatically —
    // no manual recompute needed once the sync that captured it has run.
    expect(weeklyAvailabilityForDate("hristina@admindagency.com", "2026-09-10", history)).toEqual(
      halfDay
    );
  });

  it("returns undefined (caller falls back to live availability) for a date before any recorded snapshot", () => {
    const history = appendAvailabilitySnapshot([], "2026-09-01T00:00:00.000Z", {
      "alice@x.com": fullTime,
    });
    expect(weeklyAvailabilityForDate("alice@x.com", "2026-01-01", history)).toBeUndefined();
  });

  it("returns undefined when there is no history at all", () => {
    expect(weeklyAvailabilityForDate("alice@x.com", "2026-05-01", [])).toBeUndefined();
  });

  it("returns undefined for a person absent from every snapshot (new hire not yet synced)", () => {
    const history = appendAvailabilitySnapshot([], "2026-09-01T00:00:00.000Z", {
      "alice@x.com": fullTime,
    });
    expect(weeklyAvailabilityForDate("brandnew@x.com", "2026-09-10", history)).toBeUndefined();
  });

  it("is case-insensitive on email", () => {
    const history = appendAvailabilitySnapshot([], "2026-09-01T00:00:00.000Z", {
      "alice@x.com": fullTime,
    });
    expect(weeklyAvailabilityForDate("Alice@X.com", "2026-09-10", history)).toEqual(fullTime);
  });

  it("applies the known-historical Hristina fact even with no sync-recorded history yet", () => {
    // Confirmed live 2026-09-22: without this seed, Team 2's Q2 utilization
    // read 86%/78% billable because her *current* 4h/day got applied flat
    // across the whole year. With it, Q1–Q3 correctly split at 2026-09-01.
    const HRISTINA = "hristina.gjorgijevska@admindagency.com";
    expect(weeklyAvailabilityForDate(HRISTINA, "2026-04-15", [])).toEqual({
      monday: 8 * 3600,
      tuesday: 8 * 3600,
      wednesday: 8 * 3600,
      thursday: 8 * 3600,
      friday: 8 * 3600,
      saturday: 0,
      sunday: 0,
    });
    expect(weeklyAvailabilityForDate(HRISTINA, "2026-09-15", [])).toEqual({
      monday: 4 * 3600,
      tuesday: 4 * 3600,
      wednesday: 4 * 3600,
      thursday: 4 * 3600,
      friday: 4 * 3600,
      saturday: 0,
      sunday: 0,
    });
  });

  it("resolves a departed member's real per-month rate instead of a smoothed average across their tenure (Szymon Skrzypczak: declining toward June departure)", () => {
    // Real Scoro data: Apr logged/absence gross = 176h (full-time, capped at
    // 8h/day) vs Jun logged 75h + 8h absence = 83h gross — he left mid-June,
    // so his real gross availability that month was already well below a
    // full 8h/day rate even before any absence. A single flat average
    // across his whole tenure would undershoot April (his real rate was
    // above his own average then) — confirmed live 2026-09-25 this made
    // Team FE's utilization read high. Per-month entries avoid that.
    //
    // Jan-Mar entries were deliberately removed 2026-09-25: Q1 2026 is now
    // hardcoded team-by-team from the spreadsheets (see
    // q1-2026-hardcoded-kpis.ts) rather than computed from live Scoro data,
    // so a Jan-Mar snapshot for a departed member on a hardcoded team (Team
    // FE) is unreachable dead code — this test moved to Apr/Jun, both still
    // live for Q2.
    const SZYMON = "szymon.skrzypczak@admindagency.com";
    const apr = weeklyAvailabilityForDate(SZYMON, "2026-04-15", []);
    const jun = weeklyAvailabilityForDate(SZYMON, "2026-06-10", []);
    expect(apr).toBeDefined();
    expect(jun).toBeDefined();
    // April (full-time, capped at 8h/day) is well above June's partial
    // month — the whole point of going per-month.
    expect(apr!.monday).toBeGreaterThan(jun!.monday);
    expect(apr!.monday).toBeCloseTo(8 * 3600, 0);
    expect(jun!.monday).toBeCloseTo((83 / 22) * 3600, 0);
  });
});
