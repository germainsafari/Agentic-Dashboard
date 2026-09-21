import { NextResponse } from "next/server";
import { readMeta, getCachedDirector } from "@/lib/snapshot-cache";
import { buildTeamMembershipLookup } from "@/lib/scoro-live";

export const dynamic = "force-dynamic";

// TEMPORARY diagnostic route — added 2026-09-21 to inspect real persisted
// roster-history for the Team 4 Q2 utilization=100% investigation. Remove
// once diagnosed.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const directorId = searchParams.get("director") ?? "marta";
  const teamCode = searchParams.get("team") ?? "4";

  const meta = await readMeta();
  const history = meta.rosterHistory ?? [];
  const dir = await getCachedDirector(directorId);
  const teamStats = dir?.teamStats.find((t) => t.team.code === teamCode);

  const teamHistory = history.map((snap) => ({
    syncedAt: snap.syncedAt,
    team: snap.byTeam[teamCode] ?? null,
  }));

  const lookup = buildTeamMembershipLookup(
    teamCode,
    teamStats?.team.members.map((m) => m.email) ?? [],
    history
  );
  const testDates = ["2026-04-15", "2026-05-15", "2026-06-15", "2026-06-30", "2026-07-01", "2026-08-15", "2026-09-15"];
  const membershipChecks = (teamStats?.team.members ?? []).map((m) => ({
    email: m.email,
    perDate: Object.fromEntries(testDates.map((d) => [d, lookup(m.email, d)])),
  }));

  return NextResponse.json({
    directorId,
    teamCode,
    lastSyncAt: meta.lastSyncAt,
    totalHistorySnapshots: history.length,
    earliestSnapshotDate: history[0]?.syncedAt ?? null,
    latestSnapshotDate: history[history.length - 1]?.syncedAt ?? null,
    teamHistoryOverTime: teamHistory,
    teamCurrentMembers: teamStats?.team.members.map((m) => m.email) ?? [],
    teamFormerMemberEmails: teamStats?.team.formerMemberEmails ?? [],
    teamUtilizationDebug: teamStats?.stats.kpiDebug?.utilization ?? null,
    teamAllKpiDebug: teamStats?.stats.kpiDebug ?? null,
    membershipChecks,
  });
}
