import mappingRaw from "@/mapping_ba_update.json";

export type TeamCode = string;

export type MappingMember = {
  name: string;
  email: string;
  team: TeamCode;
  leader_email: string;
  weekly_target: number;
  is_team_lead?: boolean;
};

export type TeamLeaderEntry = {
  leader_email: string;
  upper_leader_email: string;
  report_format?: string;
  /** Previous team leads (e.g. someone who left the company) whose historical
   * completed projects should still count toward this team's FTA/Estimate
   * KPIs — the current leader_email is who's credited going forward, but a
   * project a former lead touched and completed before the handoff is still
   * real team history, not something to silently drop. */
  former_leader_emails?: string[];
  /** Previous regular (non-lead) team members whose historical logged hours
   * should still count toward this team's utilization/billable KPIs once
   * they've left the live Scoro roster (e.g. left the company). Unlike
   * former_leader_emails (permanent project attribution), this just adds
   * the person's Scoro id back into the roster-derived user set for time
   * aggregation — since they have no time entries after departing, this
   * naturally only pulls in the hours they actually logged while active,
   * with no risk of phantom future hours. See Karolina Dubaj / Team 2,
   * 2026-09-21. Only needed for JSON-roster teams (no live Scoro group to
   * read this signal from automatically) — see
   * inactiveFormerMemberEmailsForTeam in scoro-roster.ts for the automatic
   * path used by teams with a live Scoro group. */
  former_member_emails?: string[];
};

export type MappingFile = {
  description: string;
  special_rules: {
    justyna_dorman?: string;
    excluded_people: string[];
  };
  team_leader_lookup: Record<TeamCode, TeamLeaderEntry>;
  members: MappingMember[];
};

export const MAPPING = mappingRaw as unknown as MappingFile;

const EXCLUDED = new Set(MAPPING.special_rules.excluded_people);

export function teamsForDirector(directorEmail: string): TeamCode[] {
  return Object.entries(MAPPING.team_leader_lookup)
    .filter(
      ([, v]) =>
        v.upper_leader_email === directorEmail ||
        v.leader_email === directorEmail
    )
    .map(([code]) => code);
}

export function membersForTeam(team: TeamCode): MappingMember[] {
  return MAPPING.members.filter(
    (m) => m.team === team && !EXCLUDED.has(m.email)
  );
}

export function leaderOfTeam(team: TeamCode): string | undefined {
  return MAPPING.team_leader_lookup[team]?.leader_email;
}

/** Former leads whose historical projects should still count for this team. */
export function formerLeadersOfTeam(team: TeamCode): string[] {
  return MAPPING.team_leader_lookup[team]?.former_leader_emails ?? [];
}

/** Former regular members whose historical hours should still count for this team. */
export function formerMembersOfTeam(team: TeamCode): string[] {
  return MAPPING.team_leader_lookup[team]?.former_member_emails ?? [];
}

export function leaderNameOfTeam(team: TeamCode): string | undefined {
  const leaderEmail = leaderOfTeam(team);
  if (!leaderEmail) return undefined;
  const leader = MAPPING.members.find((m) => m.email === leaderEmail);
  return leader?.name;
}
