/**
 * Render (or manual) cron runner: sync every director sequentially via /api/cron.
 *
 * Scheduled mode starts each director sync in the background (HTTP 202) and polls
 * /api/sync until the snapshot is fresh — avoids 15-minute client timeouts and
 * 409 errors when a long sync is still running.
 *
 * Env:
 *   APP_BASE_URL     — e.g. https://agentic-dashboard.onrender.com
 *   CRON_SECRET      — optional Bearer token (recommended in production)
 *   CRON_DIRECTORS   — optional comma list to sync a subset (e.g. piotr,marta)
 */

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

// Load .env when run locally (Render cron injects env directly).
try {
  for (const line of fs.readFileSync(".env", "utf8").replace(/\r/g, "").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch {
  // optional
}

if (!process.env.APP_BASE_URL?.trim()) {
  process.env.APP_BASE_URL = "https://agentic-dashboard.onrender.com";
}

const DIRECTORS = [
  "piotr",
  "marta",
  "dominika",
  "michal",
  "karolina",
  "jonattas",
  "krzysztof",
  "maciej",
  "justyna",
];

const TRIGGER_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;
const DIRECTOR_WAIT_MS = 25 * 60 * 1000;
const MIN_TRIGGER_GAP_MS = 60_000;

function httpGet(url, headers = {}, timeoutMs = STATUS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "GET", headers, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

let base = process.env.APP_BASE_URL?.replace(/\/$/, "");
if (base && !/^https?:\/\//i.test(base)) {
  base = `https://${base}`;
}
const secret = process.env.CRON_SECRET?.trim();

if (!base) {
  console.error("[cron-sync] APP_BASE_URL is required");
  process.exit(1);
}
if (process.env.RENDER && !secret) {
  console.error(
    "[cron-sync] CRON_SECRET is missing. Attach the shared dashboard-cron-auth environment group to this cron service."
  );
  process.exit(1);
}

const headers = secret ? { Authorization: `Bearer ${secret}` } : {};

const directors = process.env.CRON_DIRECTORS?.trim()
  ? process.env.CRON_DIRECTORS.split(",").map((d) => d.trim()).filter(Boolean)
  : DIRECTORS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSyncStatus() {
  const res = await httpGet(`${base}/api/sync`, headers, STATUS_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`/api/sync returned HTTP ${res.status}`);
  }
  const status = parseJson(res.body);
  if (!status) {
    throw new Error("/api/sync returned invalid JSON");
  }
  return status;
}

async function syncDirector(director) {
  const cronUrl = `${base}/api/cron?director=${encodeURIComponent(director)}&scheduled=1`;
  const deadline = Date.now() + DIRECTOR_WAIT_MS;
  let lastTriggerAt = 0;

  console.log(`[cron-sync] Processing ${director}…`);

  while (Date.now() < deadline) {
    const status = await fetchSyncStatus();
    const snap = status.snapshots?.find((entry) => entry.director === director);

    if (snap && !snap.overdue) {
      console.log(`[cron-sync] ${director} ✓ fresh (${snap.fetchedAt})`);
      return true;
    }

    const now = Date.now();
    if (!status.running && now - lastTriggerAt >= MIN_TRIGGER_GAP_MS) {
      console.log(`[cron-sync] Triggering ${director}…`);
      const res = await httpGet(cronUrl, headers, TRIGGER_TIMEOUT_MS);
      console.log(`[cron-sync] ${director} → HTTP ${res.status}: ${res.body.slice(0, 300)}`);

      lastTriggerAt = now;
      const body = parseJson(res.body);

      if (res.status === 401) {
        throw new Error("Unauthorized — check CRON_SECRET matches the web service");
      }

      if (body?.skipped) {
        console.log(`[cron-sync] ${director} ✓ skipped (${body.fetchedAt})`);
        return true;
      }

      if (res.status === 202 || body?.status === "started" || body?.status === "busy") {
        // Background sync started or another director is still running — keep polling.
      } else if (!res.ok) {
        console.warn(`[cron-sync] ${director} trigger failed (HTTP ${res.status}), will retry`);
      }
    } else if (status.running) {
      console.log(`[cron-sync] ${director}: waiting for in-progress sync…`);
    }

    if (status.syncError && !status.running) {
      console.warn(`[cron-sync] last sync error: ${status.syncError}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error(`[cron-sync] ${director} ✗ timed out after ${DIRECTOR_WAIT_MS / 60000} minutes`);
  return false;
}

const failures = [];

for (const director of directors) {
  try {
    const ok = await syncDirector(director);
    if (!ok) failures.push(director);
  } catch (error) {
    console.error(`[cron-sync] ${director} ✗`, error);
    failures.push(director);
  }
}

if (failures.length > 0) {
  console.error(`[cron-sync] Failed directors: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("[cron-sync] All directors synced.");
