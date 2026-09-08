/**
 * Render (or manual) cron runner: sync every director sequentially via /api/cron.
 *
 * Env:
 *   APP_BASE_URL     — e.g. https://admind-agentic-dashboard.onrender.com
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

const PAUSE_MS = 60_000;
const FETCH_TIMEOUT_MS = 15 * 60 * 1000; // per director — Scoro sync can take 5–10 min
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2 * 60 * 1000;

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "GET", headers, timeout: FETCH_TIMEOUT_MS },
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
      req.destroy(new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.end();
  });
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
const failures = [];

for (const director of directors) {
  const url = `${base}/api/cron?director=${encodeURIComponent(director)}&scheduled=1`;
  let succeeded = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[cron-sync] Syncing ${director} (attempt ${attempt}/${MAX_ATTEMPTS})…`);
      const res = await httpGet(url, headers);
      console.log(`[cron-sync] ${director} → HTTP ${res.status}: ${res.body.slice(0, 300)}`);

      if (res.ok) {
        succeeded = true;
        break;
      }

      const retryable = res.status === 409 || res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
    } catch (error) {
      console.error(`[cron-sync] ${director} request failed:`, error);
      if (attempt === MAX_ATTEMPTS) break;
    }

    console.log(`[cron-sync] Retrying ${director} in ${RETRY_DELAY_MS / 1000}s…`);
    await sleep(RETRY_DELAY_MS);
  }

  if (!succeeded) failures.push(director);
  if (director !== directors[directors.length - 1]) {
    await sleep(PAUSE_MS);
  }
}

if (failures.length > 0) {
  console.error(`[cron-sync] Failed directors: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("[cron-sync] All directors synced.");
