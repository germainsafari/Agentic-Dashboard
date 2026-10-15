"use client";

import { Donut } from "@/components/ui/Donut";
import { GoalBar } from "@/components/ui/GoalBar";
import { COLORS, KPI_META, type Period } from "@/lib/brand";
import { isFtaMutedForTeam } from "@/lib/fta-display";
import type { ResolvedDirector } from "@/lib/directors";
import type { MockEscalation, TeamStats } from "@/lib/mock";
import { TeamHeader } from "./TeamHeader";
import {
  EscalationProjectsPanel,
  HoverPopover,
  PitchProjectsPanel,
} from "./ProjectListPopover";
import { pitchTasksFor } from "@/lib/pitch-display";

type TeamBundle = { team: ResolvedDirector["teams"][number]; stats: TeamStats };

type Props = {
  teamStats: TeamBundle[];
  quarter: Period;
  escalationsByTeam: Record<string, MockEscalation[]>;
  onTeamClick: (teamIdx: number, mode?: "escalation") => void;
  ftaEnabledTeamCodes: string[];
};

export function LayoutCards({
  teamStats,
  quarter,
  escalationsByTeam,
  onTeamClick,
  ftaEnabledTeamCodes,
}: Props) {
  const ftaMutedForTeam = (teamCode: string) =>
    isFtaMutedForTeam(teamCode, ftaEnabledTeamCodes);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        gap: 0,
        borderTop: `1px solid ${COLORS.hairline}`,
        borderLeft: `1px solid ${COLORS.hairline}`,
      }}
    >
      {teamStats.map(({ team, stats }, ti) => {
        const teamEscalations = escalationsByTeam[team.code] ?? [];
        const escCount = teamEscalations.length;
        return (
          <div
            key={team.code}
            style={{
              borderRight: `1px solid ${COLORS.hairline}`,
              borderBottom: `1px solid ${COLORS.hairline}`,
              padding: 24,
              background: "#fff",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                borderBottom: `1px solid ${COLORS.hairline}`,
                paddingBottom: 16,
                marginBottom: 18,
                gap: 12,
              }}
            >
              <div className="flex-1">
                <TeamHeader
                  team={team}
                  idx={ti}
                  activeProjects={stats.activeProjects}
                  onClick={() => onTeamClick(ti)}
                  variant="card"
                />
              </div>
              {escCount > 0 && (
                <HoverPopover
                  panel={<EscalationProjectsPanel escalations={teamEscalations} align="right" />}
                >
                  <button
                    type="button"
                    onClick={() => onTeamClick(ti, "escalation")}
                    className="border-0 cursor-pointer uppercase"
                    style={{
                      background: COLORS.tangerine,
                      color: "#fff",
                      padding: "6px 10px",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {escCount} esc.
                  </button>
                </HoverPopover>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gridTemplateRows: "auto auto auto",
                gap: "16px 20px",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  gridRow: "span 3",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Donut
                  value={stats.kpis.utilization[quarter]}
                  goal={75}
                  size={148}
                  thickness={6}
                />
                <div
                  className="uppercase text-muted text-center"
                  style={{ fontSize: 10, letterSpacing: "0.1em" }}
                >
                  Project utilization
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px 20px",
                }}
              >
                {KPI_META.filter((m) => m.kind === "bar").map((meta) => {
                  const values = stats.kpis[meta.key];
                  const v = values[quarter];
                  const ftaMuted = meta.key === "fta" && ftaMutedForTeam(team.code);
                  const pitchKind =
                    meta.key === "newBizWin" ? "newBiz" : meta.key === "existingWin" ? "existing" : null;
                  const pitchTasks = pitchKind
                    ? pitchTasksFor(stats.pitchDetails, pitchKind, quarter)
                    : [];
                  const kpiBlock = (
                    <div key={meta.key}>
                      <div
                        className="uppercase mb-1.5"
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          color: ftaMuted ? COLORS.gray03 : undefined,
                        }}
                      >
                        <span className={ftaMuted ? "" : "text-muted"}>
                          {meta.shortLabel ?? meta.label}
                        </span>
                      </div>
                      <GoalBar value={v} goal={meta.goal} compact muted={ftaMuted} />
                    </div>
                  );
                  return pitchKind && pitchTasks.length > 0 ? (
                    <HoverPopover
                      key={meta.key}
                      panel={
                        <PitchProjectsPanel
                          tasks={pitchTasks}
                          kind={pitchKind}
                          period={quarter}
                          align={pitchKind === "existing" ? "right" : "left"}
                        />
                      }
                    >
                      {kpiBlock}
                    </HoverPopover>
                  ) : (
                    kpiBlock
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
