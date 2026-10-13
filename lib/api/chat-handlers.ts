import { prisma } from "@/lib/prisma";
import { currentUser, memberOnly } from "@/lib/auth";
import { ApiError, json, parseBody } from "@/lib/http";
import { getOrCreateConversation, postMessage } from "@/lib/services";
import { conversationOut, messageOut, userBrief } from "@/lib/serialize";

async function loadConv(cid: number, userId: number) {
  const c = await prisma.conversation.findUnique({
    where: { id: cid },
    include: {
      client: { include: { client: true, freelancer: true } },
      freelancer: { include: { client: true, freelancer: true } },
    },
  });
  if (!c || (userId !== c.clientId && userId !== c.freelancerId)) {
    throw new ApiError(404, "Conversation not found");
  }
  return c;
}

async function unreadTotal(uid: number) {
  return prisma.message.count({
    where: {
      senderId: { not: uid },
      read: false,
      conversation: { OR: [{ clientId: uid }, { freelancerId: uid }] },
    },
  });
}

async function markRead(c: { id: number; clientId: number; freelancerId: number }, uid: number) {
  await prisma.message.updateMany({
    where: { conversationId: c.id, senderId: { not: uid }, read: false },
    data: { read: true, readAt: new Date() },
  });
}

export async function handleChat(method: string, parts: string[], req: Request, url: URL) {
  // GET /conversations
  if (method === "GET" && parts[0] === "conversations" && parts.length === 1) {
    const user = await memberOnly(req);
    const rows = await prisma.conversation.findMany({
      where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
      include: {
        client: { include: { client: true, freelancer: true } },
        freelancer: { include: { client: true, freelancer: true } },
      },
    });
    const out = [];
    for (const c of rows) {
      const last = await prisma.message.findFirst({
        where: { conversationId: c.id },
        orderBy: { id: "desc" },
      });
      const unread = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: user.id }, read: false },
      });
      out.push(conversationOut(c, user, last, unread, false));
    }
    out.sort((a, b) => (b.last_message?.id || 0) - (a.last_message?.id || 0));
    return json(out);
  }

  // POST /conversations
  if (method === "POST" && parts[0] === "conversations" && parts.length === 1) {
    const user = await memberOnly(req);
    const body = await parseBody<{ user_id: number; message?: string }>(req);
    const other = await prisma.user.findUnique({ where: { id: body.user_id } });
    if (!other || other.role === user.role || other.role === "admin" || !other.isActive) {
      throw new ApiError(422, "Clients and freelancers can message each other");
    }
    const clientId = user.role === "client" ? user.id : other.id;
    const freelancerId = user.role === "client" ? other.id : user.id;
    const conv = await getOrCreateConversation(clientId, freelancerId);
    if ((body.message || "").trim()) await postMessage(conv.id, user.id, body.message!);
    return json({ id: conv.id }, 201);
  }

  // GET /conversations/:id/messages
  if (method === "GET" && parts[0] === "conversations" && parts[2] === "messages") {
    const user = await memberOnly(req);
    const cid = Number(parts[1]);
    const c = await loadConv(cid, user.id);
    const afterId = Number(url.searchParams.get("after_id") || 0);
    const beforeId = Number(url.searchParams.get("before_id") || 0);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 50), 100));
    let rows;
    let more = false;
    if (afterId) {
      rows = await prisma.message.findMany({
        where: { conversationId: cid, id: { gt: afterId } },
        orderBy: { id: "asc" },
        take: 200,
      });
    } else {
      const page = await prisma.message.findMany({
        where: { conversationId: cid, ...(beforeId ? { id: { lt: beforeId } } : {}) },
        orderBy: { id: "desc" },
        take: limit + 1,
      });
      more = page.length > limit;
      rows = page.slice(0, limit).reverse();
    }
    if (!beforeId) {
      await markRead(c, user.id);
    }
    const other = user.id === c.clientId ? c.freelancer : c.client;
    return json({
      other: { ...userBrief(other), online: false },
      messages: rows.map(messageOut),
      has_more: more,
    });
  }

  // POST /conversations/:id/messages
  if (method === "POST" && parts[0] === "conversations" && parts[2] === "messages") {
    const user = await memberOnly(req);
    const c = await loadConv(Number(parts[1]), user.id);
    const body = await parseBody<{ body: string }>(req);
    if (!body.body?.trim()) throw new ApiError(422, "Write a message first");
    const m = await postMessage(c.id, user.id, body.body);
    return json(messageOut(m), 201);
  }

  // POST /conversations/:id/read
  if (method === "POST" && parts[0] === "conversations" && parts[2] === "read") {
    const user = await memberOnly(req);
    const c = await loadConv(Number(parts[1]), user.id);
    await markRead(c, user.id);
    return json({ unread: await unreadTotal(user.id) });
  }

  // GET /messages/unread
  if (method === "GET" && parts[0] === "messages" && parts[1] === "unread") {
    const user = await currentUser(req);
    return json({ count: user.role === "admin" ? 0 : await unreadTotal(user.id) });
  }

  return null;
}
