import { NextResponse } from "next/server";

/** Tiny health check with no Prisma import — verifies the Node runtime is up. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, runtime: "next" });
}
