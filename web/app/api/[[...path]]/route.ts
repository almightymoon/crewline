import { NextRequest, NextResponse } from "next/server";
import { cors, dispatch } from "@/lib/api/dispatch";

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const res = await dispatch(req, path);
  return cors(res);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
