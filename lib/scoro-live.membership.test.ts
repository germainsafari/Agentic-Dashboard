import { describe, expect, it } from "vitest";
import { buildTeamMembershipLookup } from "./scoro-live";
import type { TeamRosterSnapshot } from "./snapshot-types";

describe("buildTeamMembershipLookup", () => {
  it("resolves a mover correctly on both sides of the transition", () => {
    // Alice was on Team A through mid-March, moved to Team B on 2026-03-20.
    const history: TeamRosterSnapshot[] = [
      { syncedAt: "2026-03-01T00:00:00.000Z", byTeam: { A: ["alice@x.com"], B: [] } },
      { syncedAt: "2026-03-15T00:00:00.000Z", byTeam: { A: ["alice@x.com"], B: [] } },
      { syncedAt: "2026-03-22T00:00:00.000Z", byTeam: { A: [], B: ["alice@x.com"] } },
    ];

    const lookupA = buildTeamMembershipLookup("A", [], history);
    const lookupB = buildTeamMembershipLookup("B", ["alice@x.com"], history);

    // Before the move: on Team A, not on Team B.
    expect(lookupA("alice@x.com", "2026-03-10")).toBe(true);
    expect(lookupB("alice@x.com", "2026-03-10")).toBe(false);

    // After the move: on Team B, not on Team A.
    expect(lookupA("alice@x.com", "2026-03-25")).toBe(false);
    expect(lookupB("alice@x.com", "2026-03-25")).toBe(true);

    // Nobody's hours land on both teams for the same day.
    expect(lookupA("alice@x.com", "2026-03-25") && lookupB("alice@x.com", "2026-03-25")).toBe(false);
    expect(lookupA("alice@x.com", "2026-03-10") && lookupB("alice@x.com", "2026-03-10")).toBe(false);
  });

  it("falls back to the current roster for dates predating all history", () => {
    const history: TeamRosterSnapshot[] = [
      { syncedAt: "2026-06-01T00:00:00.000Z", byTeam: { A: ["bob@x.com"] } },
    ];
    const lookup = buildTeamMembershipLookup("A", ["bob@x.com"], history);
    // 2026-01-01 predates the earliest snapshot — no recorded signal, so it
    // trusts the current roster rather than assuming absence.
    expect(lookup("bob@x.com", "2026-01-01")).toBe(true);
  });

  it("falls back to the current roster when there is no history at all", () => {
    const lookup = buildTeamMembershipLookup("A", ["carol@x.com"], []);
    expect(lookup("carol@x.com", "2026-05-01")).toBe(true);
    expect(lookup("dave@x.com", "2026-05-01")).toBe(false);
  });

  it("is case-insensitive on email", () => {
    const history: TeamRosterSnapshot[] = [
      { syncedAt: "2026-03-01T00:00:00.000Z", byTeam: { A: ["Alice@X.com"] } },
    ];
    const lookup = buildTeamMembershipLookup("A", [], history);
    expect(lookup("alice@x.com", "2026-03-05")).toBe(true);
  });

  it("resolves a known pre-tracking transfer correctly even with no history (Maria Dorda: UBS-SYN through May, FE from June)", () => {
    // No snapshot history at all — this is exactly the case the empty-
    // history fallback gets wrong for someone who moved before this
    // feature started tracking: FE is her CURRENT team, so the plain
    // fallback would say "always on FE" for January too.
    const lookupUbsSyn = buildTeamMembershipLookup("UBS-SYN", [], []);
    const lookupFe = buildTeamMembershipLookup("FE", ["maria.dorda@admindagency.com"], []);

    expect(lookupUbsSyn("maria.dorda@admindagency.com", "2026-03-01")).toBe(true);
    expect(lookupFe("maria.dorda@admindagency.com", "2026-03-01")).toBe(false);

    expect(lookupUbsSyn("maria.dorda@admindagency.com", "2026-07-01")).toBe(false);
    expect(lookupFe("maria.dorda@admindagency.com", "2026-07-01")).toBe(true);
  });

  it("does not affect anyone not listed in KNOWN_TEAM_TRANSFERS", () => {
    const lookup = buildTeamMembershipLookup("FE", ["someone.else@admindagency.com"], []);
    expect(lookup("someone.else@admindagency.com", "2026-01-01")).toBe(true);
  });
});
