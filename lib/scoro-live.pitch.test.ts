import { describe, expect, it } from "vitest";
import {
  computePitchKpisFromTasks,
  getTaskBusinessArea,
  getTaskTagValue,
  isNewBusinessPitchTask,
  isTaskCompleted,
  pitchWeightFromTag,
  taskDateIso,
  taskIsLinkedToTeamUser,
  type PitchTaskRecord,
} from "./scoro-live";

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return overrides;
}

describe("pitch task field parsing", () => {
  it("reads c_tasktag by field id from v2 custom_fields array", () => {
    const row = task({
      custom_fields: [
        { id: "c_tasktag", name: "Task Tag", value: "Pitch (<10k PLN)", type: "dropdown" },
      ],
    });
    expect(getTaskTagValue(row)).toBe("Pitch (<10k PLN)");
    expect(pitchWeightFromTag(getTaskTagValue(row))).toBe(1);
  });

  it("classifies by business area only (budget type ignored)", () => {
    const nb = task({
      custom_fields: [
        { id: "c_businessarea", name: "Business area", value: "New Business" },
        { id: "c_budgettype", name: "Budget Type", value: "CE" },
      ],
    });
    expect(isNewBusinessPitchTask(nb)).toBe(true);

    const ce = task({
      custom_fields: [
        { id: "c_businessarea", name: "Business area", value: "CE" },
        { id: "c_budgettype", name: "Budget Type", value: "New Business" },
      ],
    });
    expect(isNewBusinessPitchTask(ce)).toBe(false);
  });

  it("recognizes Scoro completed status codes and status_name", () => {
    expect(isTaskCompleted(task({ status: "task_status9", status_name: "Completed" }))).toBe(true);
    expect(isTaskCompleted(task({ status: "task_status3", status_name: "In progress" }))).toBe(false);
  });

  it("uses datetime_due for quarter bucketing", () => {
    expect(taskDateIso(task({ datetime_due: "2026-07-01T23:59:00+02:00" }))).toBe("2026-07-01");
  });

  it("links tasks to team via assignees, owner, and assigned_to", () => {
    const row = task({
      owner_id: 13,
      assigned_to: 14,
      assignees: [{ user_id: 14, email: "dominik.wycislo@admindagency.com" }],
      related_users: [14, 13],
    });
    expect(taskIsLinkedToTeamUser(row, [14])).toBe(true);
    expect(taskIsLinkedToTeamUser(row, [99])).toBe(false);
  });
});

describe("computePitchKpisFromTasks", () => {
  it("computes weighted new business win rate from completed pitches only", () => {
    const rows: PitchTaskRecord[] = [
      { taskId: 99626, projectId: 1, taskName: "Won pitch", project: "Won pitch", weight: 3, completed: true, won: true, isNewBusiness: true, quarter: "Q3" },
      { taskId: 99602, projectId: 2, taskName: "Lost pitch", project: "Lost pitch", weight: 1, completed: true, won: false, isNewBusiness: true, quarter: "Q3" },
      { taskId: 99999, projectId: 3, taskName: "Still open", project: "Still open", weight: 2, completed: false, won: false, isNewBusiness: true, quarter: "Q3" },
    ];
    const out = computePitchKpisFromTasks(rows, 2026);
    expect(out.newBizWin.Q3).toBe(75);
    expect(out.debug.newBizWin.Q3).toEqual({ numerator: 3, denominator: 4, poolSize: 2 });
  });

  it("lists exactly the completed tasks that fed each denominator, tagged won/lost and by kind", () => {
    const rows: PitchTaskRecord[] = [
      { taskId: 1, projectId: 1, taskName: "NB won", project: "NB won", weight: 3, completed: true, won: true, isNewBusiness: true, quarter: "Q3" },
      { taskId: 2, projectId: 2, taskName: "NB lost", project: "NB lost", weight: 1, completed: true, won: false, isNewBusiness: true, quarter: "Q3" },
      { taskId: 3, projectId: 3, taskName: "NB open", project: "NB open", weight: 2, completed: false, won: false, isNewBusiness: true, quarter: "Q3" },
      { taskId: 4, projectId: 4, taskName: "Existing won", project: "Existing won", weight: 2, completed: true, won: true, isNewBusiness: false, quarter: "Q2" },
    ];
    const { details, debug } = computePitchKpisFromTasks(rows, 2026);
    // Open task (id 3) never counted toward either KPI, so it must not be listed.
    expect(details.map((d) => d.taskId).sort()).toEqual([1, 2, 4]);
    expect(details.find((d) => d.taskId === 1)).toMatchObject({ won: true, kind: "newBiz", quarter: "Q3", weight: 3 });
    expect(details.find((d) => d.taskId === 2)).toMatchObject({ won: false, kind: "newBiz" });
    expect(details.find((d) => d.taskId === 4)).toMatchObject({ won: true, kind: "existing", quarter: "Q2" });
    // List and KPI stay in lockstep: per-quarter counts equal poolSize.
    expect(details.filter((d) => d.kind === "newBiz" && d.quarter === "Q3")).toHaveLength(debug.newBizWin.Q3.poolSize!);
    expect(details.filter((d) => d.kind === "existing" && d.quarter === "Q2")).toHaveLength(debug.existingWin.Q2.poolSize!);
  });
});

describe("one pitch per project", () => {
  const rec = (over: Partial<PitchTaskRecord>): PitchTaskRecord => ({
    taskId: 1,
    projectId: 100,
    taskName: "task",
    project: "P",
    weight: 1,
    completed: true,
    won: true,
    isNewBusiness: true,
    quarter: "Q2",
    ...over,
  });

  it("counts a project with several tasks once, using its highest tier", () => {
    const out = computePitchKpisFromTasks(
      [
        rec({ taskId: 1, weight: 1 }),
        rec({ taskId: 2, weight: 3 }),
        rec({ taskId: 3, weight: 2 }),
        rec({ taskId: 4, projectId: 200, project: "Other", weight: 2, won: false }),
      ],
      2026
    );
    // Project 100 once at weight 3 (won) + project 200 at weight 2 (lost): 3 / 5.
    expect(out.debug.newBizWin.Q2).toEqual({ numerator: 3, denominator: 5, poolSize: 2 });
    expect(out.newBizWin.Q2).toBe(60);
    expect(out.details.map((d) => d.project).sort()).toEqual(["Other", "P"]);
  });

  it("does NOT merge lost pitches that share an offer-prep project — each task is its own lost pitch", () => {
    const out = computePitchKpisFromTasks(
      [
        rec({ taskId: 1, projectId: 900, project: "Offer preparation", won: false, weight: 1 }),
        rec({ taskId: 2, projectId: 900, project: "Offer preparation", won: false, weight: 2 }),
        rec({ taskId: 3, projectId: 900, project: "Offer preparation", won: false, weight: 3 }),
        rec({ taskId: 4, projectId: 100, project: "Won project", won: true, weight: 3 }),
        rec({ taskId: 5, projectId: 100, project: "Won project", won: true, weight: 2 }),
      ],
      2026
    );
    // 3 lost pitches (1+2+3) + 1 won project at its highest tier (3): 3 / 9.
    expect(out.debug.newBizWin.Q2).toEqual({ numerator: 3, denominator: 9, poolSize: 4 });
    expect(out.details.filter((d) => !d.won)).toHaveLength(3);
    expect(out.details.filter((d) => d.won)).toHaveLength(1);
  });

  it("never counts one project in two quarters (earliest quarter wins a tie)", () => {
    const out = computePitchKpisFromTasks(
      [rec({ taskId: 1, quarter: "Q3" }), rec({ taskId: 2, quarter: "Q2" })],
      2026
    );
    expect(out.debug.newBizWin.Q2.poolSize).toBe(1);
    expect(out.debug.newBizWin.Q3.poolSize).toBe(0);
  });

  it("keeps new-business and existing-client pitches on the same project separate, and open tasks out of it", () => {
    const out = computePitchKpisFromTasks(
      [
        rec({ taskId: 1, isNewBusiness: true }),
        rec({ taskId: 2, isNewBusiness: false }),
        rec({ taskId: 3, isNewBusiness: true, completed: false, won: false, weight: 3 }),
      ],
      2026
    );
    expect(out.debug.newBizWin.Q2.poolSize).toBe(1);
    expect(out.debug.existingWin.Q2.poolSize).toBe(1);
    // The open weight-3 task must not displace the completed pitch.
    expect(out.debug.newBizWin.Q2.denominator).toBe(1);
  });

  it("cannot merge tasks that have no resolvable project", () => {
    const out = computePitchKpisFromTasks(
      [rec({ taskId: 1, projectId: undefined }), rec({ taskId: 2, projectId: undefined })],
      2026
    );
    expect(out.debug.newBizWin.Q2.poolSize).toBe(2);
  });
});
