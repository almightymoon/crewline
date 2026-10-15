import { prisma } from "@/lib/prisma";
import { currentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { ApiError, json, parseBody } from "@/lib/http";
import { notificationOut, userFull } from "@/lib/serialize";
import { LIVE } from "@/lib/config";

export async function handleAccount(method: string, parts: string[], req: Request, url: URL) {
  // PUT /me/account
  if (method === "PUT" && parts[0] === "me" && parts[1] === "account") {
    const user = await currentUser(req);
    const body = await parseBody<{ name?: string; email?: string; color?: string; avatar?: string }>(req);
    const data: Record<string, string> = {};
    if (body.name) data.name = body.name.trim();
    if (body.email && body.email.toLowerCase() !== user.email) {
      const email = body.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) throw new ApiError(409, "That email is already in use");
      data.email = email;
    }
    if (body.color) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) throw new ApiError(422, "Invalid color");
      data.color = body.color;
    }
    if (body.avatar !== undefined) {
      const avatar = body.avatar.trim();
      if (avatar && !avatar.startsWith("/") && !avatar.startsWith("http://") && !avatar.startsWith("https://")) {
        throw new ApiError(422, "Avatar must be a URL");
      }
      data.avatar = avatar;
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      include: { freelancer: true, client: true },
    });
    return json(userFull(updated));
  }

  // POST /me/password
  if (method === "POST" && parts[0] === "me" && parts[1] === "password") {
    const user = await currentUser(req);
    const body = await parseBody<{ current: string; new: string }>(req);
    if (!verifyPassword(body.current || "", user.passwordHash)) {
      throw new ApiError(403, "Your current password is incorrect");
    }
    if (body.current === body.new) throw new ApiError(422, "Choose a password you have not used here");
    if (!body.new || body.new.length < 8) throw new ApiError(422, "Password must be at least 8 characters");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.new) } });
    return json({ ok: true });
  }

  // PUT /me/preferences
  if (method === "PUT" && parts[0] === "me" && parts[1] === "preferences") {
    const user = await currentUser(req);
    const body = await parseBody<{ orders?: boolean; proposals?: boolean; messages?: boolean; announcements?: boolean }>(req);
    const prefs = {
      orders: body.orders !== false,
      proposals: body.proposals !== false,
      messages: body.messages !== false,
      announcements: body.announcements !== false,
    };
    await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: prefs } });
    return json(prefs);
  }

  // POST /me/deactivate
  if (method === "POST" && parts[0] === "me" && parts[1] === "deactivate") {
    const user = await currentUser(req);
    if (user.role === "admin") throw new ApiError(403, "Admin accounts cannot be deactivated here");
    const body = await parseBody<{ password: string }>(req);
    if (!verifyPassword(body.password || "", user.passwordHash)) throw new ApiError(403, "Password is incorrect");
    const live = await prisma.order.count({
      where: {
        ...(user.role === "client" ? { clientId: user.id } : { freelancerId: user.id }),
        status: { in: [...LIVE] },
      },
    });
    if (live) throw new ApiError(409, "Finish or cancel your active orders before closing your account");
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, suspendedReason: "Closed by the account owner" },
    });
    return json({ ok: true });
  }

  // GET /notifications
  if (method === "GET" && parts[0] === "notifications" && parts.length === 1) {
    const user = await currentUser(req);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
    const beforeId = Number(url.searchParams.get("before_id") || 0);
    const rows = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly ? { read: false } : {}),
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit,
    });
    const count = await prisma.notification.count({ where: { userId: user.id, read: false } });
    return json({ items: rows.map(notificationOut), unread: count });
  }

  // POST /notifications/read
  if (method === "POST" && parts[0] === "notifications" && parts[1] === "read") {
    const user = await currentUser(req);
    const body = await parseBody<{ ids?: number[]; all?: boolean }>(req);
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        read: false,
        ...(body.all ? {} : { id: { in: body.ids?.length ? body.ids : [0] } }),
      },
      data: { read: true },
    });
    const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });
    return json({ unread });
  }

  return null;
}
