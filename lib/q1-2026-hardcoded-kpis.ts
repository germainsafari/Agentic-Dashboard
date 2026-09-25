/**
 * Q1 2026 utilization/billable numerator+denominator, hardcoded per team from
 * the Traffic Management reconciliation spreadsheets
 * (G:\Dyski współdzielone\Traffic Management\TM_REPORTS_2023\01_Billable vs
 * nonbillable\2026\2026-0{1,2,3}_Billability Calc_final*.xlsx, "Calc" sheet,
 * summed Jan+Feb+Mar). Q1 target hours can't be reconstructed correctly from
 * live Scoro data: the flat weekday-based target has no public-holiday
 * calendar (confirmed live 2026-09-25 — January's target alone was off by 3-4
 * working days per person, and absence tracking in Scoro itself only started
 * partway through the year), while the spreadsheet's own target already
 * accounts for both. Numerator (utilization/billable hours) already matched
 * the live computation almost exactly wherever checked, but is hardcoded too
 * for consistency — Q1 is a closed, non-retouched quarter (per the user,
 * 2026-09-25), so freezing it entirely from the spreadsheet is safer than
 * mixing sources.
 *
 * CT and UBS_BA have no team-level "Calc" row in the spreadsheet (it only
 * rolls up 20 of the org's teams) — their target is summed from the
 * spreadsheet's per-person "Lista osób - ALL" sheet instead. CT's
 * utilization is the live app number (its roster/logged-hours totals closely
 * matched the spreadsheet's own person-level sums, so it's trustworthy);
 * UBS_BA's live app number wasn't trustworthy (its roster only resolved 1 of
 * 3 real Q1 members — 368h logged vs the spreadsheet's 574h — because two
 * departed members no longer resolve via Scoro's live user list), so its
 * utilization is approximated as its raw billable_time sum from the
 * spreadsheet's "Timesheet" sheet instead (a lower-bound proxy, not a real
 * classification).
 *
 * PM-1, PM-2, PM-4, PM-OTHER, PM-BM, and FURTI are deliberately absent: the
 * spreadsheet has no data for FURTI at all, and only a single combined "PM"
 * row that can't be split across the five PM-* sub-teams — per the user
 * 2026-09-25, these six stay on the live Scoro computation rather than guess
 * a split.
 */

export type Q1HardcodedKpi = {
  utilization: { numerator: number; denominator: number };
  billable: { numerator: number; denominator: number };
};

export const Q1_2026_HARDCODED_KPIS: Record<string, Q1HardcodedKpi> = {
  "1": { utilization: { numerator: 5657976, denominator: 9424800 }, billable: { numerator: 4844088, denominator: 9424800 } },
  "2": { utilization: { numerator: 6781392, denominator: 9892800 }, billable: { numerator: 5949792, denominator: 9892800 } },
  "4": { utilization: { numerator: 4349556, denominator: 6323400 }, billable: { numerator: 3448836, denominator: 6323400 } },
  "3D": { utilization: { numerator: 4442400, denominator: 6825600 }, billable: { numerator: 2843100, denominator: 6825600 } },
  ACC: { utilization: { numerator: 6313788, denominator: 8294400 }, billable: { numerator: 5143176, denominator: 8294400 } },
  BA: { utilization: { numerator: 7596900, denominator: 9072000 }, billable: { numerator: 6698988, denominator: 9072000 } },
  CAMPAIGNS: { utilization: { numerator: 2160000, denominator: 3024000 }, billable: { numerator: 1595700, denominator: 3024000 } },
  CD: { utilization: { numerator: 2573172, denominator: 4579200 }, billable: { numerator: 1613268, denominator: 4579200 } },
  COE: { utilization: { numerator: 5886648, denominator: 8035200 }, billable: { numerator: 5053248, denominator: 8035200 } },
  COPYWRITER: { utilization: { numerator: 1155312, denominator: 1670400 }, billable: { numerator: 786024, denominator: 1670400 } },
  "DP & BP": { utilization: { numerator: 8451000, denominator: 11725200 }, billable: { numerator: 7523100, denominator: 11725200 } },
  FE: { utilization: { numerator: 4038300, denominator: 4953600 }, billable: { numerator: 3095100, denominator: 4953600 } },
  "MO - MAJA": { utilization: { numerator: 4721076, denominator: 5925600 }, billable: { numerator: 3638376, denominator: 5925600 } },
  "MO - MO": { utilization: { numerator: 4290300, denominator: 5688000 }, billable: { numerator: 3237300, denominator: 5688000 } },
  "PM-DP": { utilization: { numerator: 4552272, denominator: 6505200 }, billable: { numerator: 3875472, denominator: 6505200 } },
  PPT: { utilization: { numerator: 11144124, denominator: 16234200 }, billable: { numerator: 10362024, denominator: 16234200 } },
  PRINC: { utilization: { numerator: 7955100, denominator: 9648000 }, billable: { numerator: 6289200, denominator: 9648000 } },
  STR: { utilization: { numerator: 2241720, denominator: 6210000 }, billable: { numerator: 1498536, denominator: 6210000 } },
  "UBS-SYN": { utilization: { numerator: 5119812, denominator: 9158400 }, billable: { numerator: 3823740, denominator: 9158400 } },
  UX: { utilization: { numerator: 2773980, denominator: 4780800 }, billable: { numerator: 2034792, denominator: 4780800 } },
  CT: { utilization: { numerator: 1546488, denominator: 8035200 }, billable: { numerator: 843660, denominator: 8035200 } },
  UBS_BA: { utilization: { numerator: 690300, denominator: 2059200 }, billable: { numerator: 690300, denominator: 2059200 } },
};
