"use client";

import React from "react";
import { COLORS, type Period } from "@/lib/brand";
import type { MockEscalation, PitchTaskDetail } from "@/lib/mock";
import { sortPitches } from "@/lib/pitch-display";

const WON_COLOR = "#4ADE80";
const LOST_COLOR = "#FF5C5C";

type ShellProps = {
  heading: string;
  children: React.ReactNode;
  align?: "left" | "right";
  /** Lets a parent that shows its own cursor-following tooltip hide it while the pointer is on this panel. */
  onPanelHover?: (over: boolean) => void;
};

/**
 * Dark hover panel in the style of the team-members popover in TeamHeader.
 * Positioned just below its (position: relative) parent. The 8px visual gap is
 * padding rather than margin so the pointer never crosses a dead zone between
 * the anchor and the panel — that is what lets a long list be scrolled.
 */
export function PopoverShell({ heading, children, align = "left", onPanelHover }: ShellProps) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseEnter={() => onPanelHover?.(true)}
      onMouseLeave={() => onPanelHover?.(false)}
      style={{
        position: "absolute",
        top: "100%",
        [align]: 0,
        paddingTop: 8,
        zIndex: 70,
        cursor: "default",
        textAlign: "left",
      }}
    >
      <div
        style={{
          background: COLORS.ink,
          border: "1px solid #2E2E2E",
          color: "#fff",
          padding: "10px 14px",
          fontSize: 11,
          lineHeight: 1.7,
          minWidth: 240,
          maxWidth: 360,
          maxHeight: 320,
          overflowY: "auto",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        }}
      >
        <div
          className="uppercase"
          style={{
            fontSize: 9,
            letterSpacing: "0.08em",
            color: COLORS.gray03,
            marginBottom: 6,
          }}
        >
          {heading}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Wraps an anchor and shows `panel` while the pointer is over the anchor or the panel. */
export function HoverPopover({
  panel,
  children,
  style,
}: {
  panel: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div
      style={{ position: "relative", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && panel}
    </div>
  );
}

export function PitchProjectsPanel({
  tasks,
  kind,
  period,
  align,
  onPanelHover,
}: {
  tasks: PitchTaskDetail[];
  kind: PitchTaskDetail["kind"];
  period: Period;
  align?: "left" | "right";
  onPanelHover?: (over: boolean) => void;
}) {
  if (tasks.length === 0) return null;
  const rows = sortPitches(tasks);
  const wonTasks = tasks.filter((t) => t.won).length;
  const label = kind === "newBiz" ? "New business pitches" : "Existing client pitches";
  return (
    <PopoverShell
      heading={`${label} · ${period} · ${wonTasks} won / ${tasks.length - wonTasks} lost`}
      align={align}
      onPanelHover={onPanelHover}
    >
      {rows.map((r, i) => (
        <div
          key={r.taskId ?? `${r.project}-${i}`}
          style={{ color: r.won ? WON_COLOR : LOST_COLOR, display: "flex", gap: 6 }}
        >
          <span aria-label={r.won ? "won" : "lost"} style={{ flex: "none" }}>
            {r.won ? "✓" : "✕"}
          </span>
          {/* A lost pitch never became a project: it is a task on a shared offer-preparation
              project, so the task is its identity and the project goes on hover. */}
          <span
            style={{ flex: 1 }}
            title={!r.won && r.task ? `Offer preparation project: ${r.project}` : undefined}
          >
            {r.won ? r.project : r.task || r.project}
          </span>
          <span style={{ flex: "none", color: COLORS.gray03 }}>×{r.weight}</span>
        </div>
      ))}
    </PopoverShell>
  );
}

export function EscalationProjectsPanel({
  escalations,
  align,
}: {
  escalations: MockEscalation[];
  align?: "left" | "right";
}) {
  if (escalations.length === 0) return null;
  return (
    <PopoverShell
      heading={`Escalated project${escalations.length === 1 ? "" : "s"} · ${new Date().getFullYear()}`}
      align={align}
    >
      {escalations.map((e) => (
        <div key={e.id}>{e.project}</div>
      ))}
    </PopoverShell>
  );
}
