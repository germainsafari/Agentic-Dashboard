import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { allResolvedDirectors } from "@/lib/directors";
import { isPersistentCacheEnabled, getPersistentStoreLabel } from "@/lib/snapshot-cache";
import { syncIntervalDays } from "@/lib/sync-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled Scoro sync — refreshes director snapshots into Redis (Upstash KV).
 *
 * Vercel cron (vercel.json): one job per director every SYNC_INTERVAL_DAYS
 * (default 3), staggered to stay within the 300 s function limit.
 *
 * Usage:
 *   GET /api/cron                    — sync all directors sequentially (may timeout)
 *   GET /api/cron?director=marta     — sync a single director (preferred for cron)
 *
 * Auth: Bearer token via CRON_SECRET env var (optional but recommended).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const directorId = req.nextUrl.searchParams.get("director") ?? undefined;
  const startMs = Date.now();

  try {
    if (directorId) {
      await runSync(directorId);
    } else {
      const dirs = allResolvedDirectors();
      for (const dir of dirs) {
        await runSync(dir.id);
      }
    }
    return NextResponse.json({
      ok: true,
      director: directorId ?? "all",
      durationMs: Date.now() - startMs,
      persistentCache: isPersistentCacheEnabled(),
      store: getPersistentStoreLabel(),
      syncIntervalDays: syncIntervalDays(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
