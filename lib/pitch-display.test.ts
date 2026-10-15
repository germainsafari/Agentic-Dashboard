import { describe, expect, it } from "vitest";
import type { PitchTaskDetail } from "./mock";
import { pitchTasksFor, sortPitches } from "./pitch-display";

const t = (
  project: string,
  won: boolean,
  weight: 1 | 2 | 3 = 1,
  kind: PitchTaskDetail["kind"] = "newBiz",
  quarter: PitchTaskDetail["quarter"] = "Q2"
): PitchTaskDetail => ({ project, task: "task", won, weight, kind, quarter });

describe("pitchTasksFor", () => {
  const all = [t("A", true, 1, "newBiz", "Q1"), t("B", false, 1, "newBiz", "Q2"), t("C", true, 1, "existing", "Q2")];

  it("filters by kind and quarter, and YTD keeps every quarter", () => {
    expect(pitchTasksFor(all, "newBiz", "Q2").map((d) => d.project)).toEqual(["B"]);
    expect(pitchTasksFor(all, "newBiz", "YTD").map((d) => d.project)).toEqual(["A", "B"]);
    expect(pitchTasksFor(all, "existing", "Q1")).toEqual([]);
  });

  it("returns an empty list for snapshots synced before pitchDetails existed", () => {
    expect(pitchTasksFor(undefined, "newBiz", "Q2")).toEqual([]);
  });
});

describe("sortPitches", () => {
  it("lists won pitches before lost ones and sorts numbers naturally", () => {
    const rows = sortPitches([t("Lost one", false), t("Pitch 10", true), t("Pitch 2", true)]);
    expect(rows.map((r) => `${r.won ? "won" : "lost"}:${r.project}`)).toEqual([
      "won:Pitch 2",
      "won:Pitch 10",
      "lost:Lost one",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [t("B", false), t("A", true)];
    sortPitches(input);
    expect(input.map((x) => x.project)).toEqual(["B", "A"]);
  });
});
