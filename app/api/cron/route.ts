import { NextRequest, NextResponse } from "next/server";
import { runSync, SyncAlreadyRunningError, isSyncRunning, triggerSync } from "@/lib/sync";
import { allResolvedDirectors } from "@/lib/directors";
import {
  getCachedDirector,
  isPersistentCacheEnabled,
  getPersistentStoreLabel,
} from "@/lib/snapshot-cache";
import { syncIntervalDays, syncIntervalMs } from "@/lib/sync-schedule";

export const dynamic = "force-dynamic";
// Production syncs can take 5–10 minutes per director. Render does not enforce
// this Next.js hint; Vercel requires Pro/Enterprise for durations above 300 s.
export const maxDuration = 800;

/**
 * Scheduled Scoro sync — refreshes director snapshots into Redis (Upstash KV).
 *
 * Vercel cron (vercel.json): one job per director every SYNC_INTERVAL_DAYS
 * (default 3), staggered to stay within the 300 s function limit.
 *
 * Usage:
 *   GET /api/cron                    — sync all directors sequentially (may timeout)
 *   GET /api/cron?director=marta&scheduled=1 — due-check + async start (Render cron)
 *   GET /api/cron?director=marta     — sync a single director (blocking)
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
  const scheduled = req.nextUrl.searchParams.get("scheduled") === "1";
  const startMs = Date.now();

  try {
    if (directorId) {
      const directorExists = allResolvedDirectors().some((director) => director.id === directorId);
      if (!directorExists) {
        return NextResponse.json(
          { ok: false, error: `Unknown director: ${directorId}` },
          { status: 400 }
        );
      }

      if (scheduled) {
        const cached = await getCachedDirector(directorId);
        const fetchedAtMs = cached ? new Date(cached.fetchedAt).getTime() : Number.NaN;
        if (Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs < syncIntervalMs()) {
          return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "snapshot_not_due",
            director: directorId,
            fetchedAt: cached!.fetchedAt,
            nextDueAt: new Date(fetchedAtMs + syncIntervalMs()).toISOString(),
            syncIntervalDays: syncIntervalDays(),
          });
        }

        // Scheduled cron: start sync in the background and return immediately so
        // the caller can poll /api/sync instead of holding an HTTP connection
        // for 10–20 minutes (which caused client timeouts and 409 cascades).
        if (isSyncRunning()) {
          return NextResponse.json(
            {
              ok: true,
              status: "busy",
              director: directorId,
              message: "Another sync is already running",
            },
            { status: 202 }
          );
        }

        const started = triggerSync(directorId);
        if (!started.started) {
          return NextResponse.json(
            {
              ok: true,
              status: "busy",
              director: directorId,
              message: started.message,
            },
            { status: 202 }
          );
        }

        return NextResponse.json(
          {
            ok: true,
            status: "started",
            director: directorId,
            message: started.message,
            syncIntervalDays: syncIntervalDays(),
          },
          { status: 202 }
        );
      }

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
    const status = e instanceof SyncAlreadyRunningError ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
