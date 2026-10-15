import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(status: number, message: string) {
  return NextResponse.json({ detail: message }, { status });
}

export async function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

export function handleError(e: unknown) {
  if (e instanceof ApiError) return err(e.status, e.message);
  console.error(e);
  return err(500, "Internal server error");
}
