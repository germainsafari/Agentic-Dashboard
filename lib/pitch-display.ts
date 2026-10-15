import type { Period } from "./brand";
import type { PitchTaskDetail } from "./mock";

/** The pitches behind New biz win / Existing win for the selected period (empty on snapshots that predate `pitchDetails`). */
export function pitchTasksFor(
  details: PitchTaskDetail[] | undefined,
  kind: PitchTaskDetail["kind"],
  period: Period
): PitchTaskDetail[] {
  if (!details) return [];
  return details.filter((d) => d.kind === kind && (period === "YTD" || d.quarter === period));
}

/** Won pitches first, then lost; each group in natural (numeric-aware) order by project name. */
export function sortPitches(tasks: PitchTaskDetail[]): PitchTaskDetail[] {
  const byName = (a: PitchTaskDetail, b: PitchTaskDetail) =>
    a.project.localeCompare(b.project, undefined, { numeric: true, sensitivity: "base" });
  return [...tasks.filter((t) => t.won).sort(byName), ...tasks.filter((t) => !t.won).sort(byName)];
}
