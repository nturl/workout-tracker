import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readFile } from "fs/promises";
import path from "path";

// Exercise demo stills captured from Noel's PT app. They are the provider's
// images, so they live outside public/ and are only served to a signed-in
// user. next.config.mjs traces src/assets/exercises into this function.
const NAME = /^[a-z0-9-]+\.jpg$/;

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!NAME.test(params.name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const file = await readFile(path.join(process.cwd(), "src/assets/exercises", params.name));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
