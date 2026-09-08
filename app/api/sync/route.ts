import { NextRequest, NextResponse } from "next/server";
import { getSyncStatus, triggerSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
// Allow up to 300 seconds for full sync (Vercel Pro required for > 60s)
export const maxDuration = 300;

export async function GET() {
  const status = await getSyncStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const director = searchParams.get("director") ?? undefined;
  const result = triggerSync(director);
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}
