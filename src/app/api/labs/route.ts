import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { labsActionSchema } from "@/lib/validators";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { getRedis } from "@/lib/redis";
import {
  getLabTests,
  getLabTest,
  deleteLabTest,
  importLab,
  getLabsSummary,
} from "@/lib/biomarkerStore";

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const labId = searchParams.get("id");

    if (labId) {
      const lab = await getLabTest(userId, labId);
      if (!lab) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
      return NextResponse.json({ lab });
    }

    const labs = await getLabTests(userId);
    return NextResponse.json({ labs });
  } catch (error) {
    console.error("Labs GET error:", error);
    return NextResponse.json({ error: "Failed to load labs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = labsActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const action = parsed.data;

    switch (action.action) {
      case "list": {
        const labs = await getLabTests(userId);
        return NextResponse.json({ labs });
      }
      case "get": {
        const lab = await getLabTest(userId, action.labId);
        if (!lab) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
        return NextResponse.json({ lab });
      }
      case "import": {
        const lab = await importLab(userId, action.data);
        // Invalidate cached health goals so they regenerate with new data
        // (mirrors /api/extract-labs's photo-import path).
        const redis = getRedis();
        await redis.del(`user:${userId}:health-goals`);
        return NextResponse.json({ lab, success: true });
      }
      case "delete": {
        const deleted = await deleteLabTest(userId, action.labId);
        if (!deleted) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
        // Deleting markers also changes the data goals are derived from.
        const redis = getRedis();
        await redis.del(`user:${userId}:health-goals`);
        return NextResponse.json({ success: true });
      }
      case "summary": {
        const summary = await getLabsSummary(userId);
        return NextResponse.json({ summary });
      }
    }
  } catch (error) {
    console.error("Labs POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
