import { NextResponse } from "next/server";
import { ApiError, err, handleError, json } from "@/lib/http";
import { handleAuth } from "./auth-handlers";
import { handleAccount } from "./account-handlers";
import { handleCatalog } from "./catalog-handlers";
import { handleWork } from "./work-handlers";
import { handleChat } from "./chat-handlers";
import { handleAdmin } from "./admin-handlers";

export async function dispatch(req: Request, pathParts: string[]) {
  try {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const parts = pathParts.filter(Boolean);

    if (method === "GET" && parts[0] === "health" && parts.length === 1) {
      return json({ ok: true, online: 0 });
    }

    const authRes = await handleAuth(method, parts, req);
    if (authRes) return authRes;

    const handlers = [handleAccount, handleCatalog, handleWork, handleChat, handleAdmin];
    for (const h of handlers) {
      const res = await h(method, parts, req, url);
      if (res) return res;
    }

    return err(404, "Not found");
  } catch (e) {
    if (e instanceof ApiError) return err(e.status, e.message);
    return handleError(e);
  }
}

export function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}
