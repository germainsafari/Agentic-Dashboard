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
});
