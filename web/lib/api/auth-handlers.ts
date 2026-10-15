import { prisma } from "@/lib/prisma";
import {
  checkThrottle,
  clearFails,
  clientKey,
  createToken,
  currentUser,
  hashPassword,
  pickColor,
  recordFail,
  verifyPassword,
} from "@/lib/auth";
import { ApiError, json, parseBody } from "@/lib/http";
import { getSettings } from "@/lib/services";
import { userFull } from "@/lib/serialize";

export async function handleAuth(method: string, parts: string[], req: Request) {
  if (parts[0] !== "auth") return null;
  const rest = parts.slice(1);

  // POST /auth/register
  if (method === "POST" && rest[0] === "register" && rest.length === 1) {
    const body = await parseBody<{
      email: string;
      password: string;
      name: string;
      role: "client" | "freelancer";
      company?: string;
      headline?: string;
    }>(req);
    const settings = await getSettings();
    if (!settings.signups_enabled) throw new ApiError(403, "New sign-ups are paused right now.");
    if (!body.email || !body.password || !body.name || !["client", "freelancer"].includes(body.role)) {
      throw new ApiError(422, "Invalid registration data");
    }
    if (body.password.length < 8) throw new ApiError(422, "Password must be at least 8 characters");
    const email = body.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new ApiError(409, "An account with this email already exists");
    }
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(body.password),
        name: body.name.trim(),
        role: body.role,
        color: pickColor(),
        notifyPrefs: { orders: true, proposals: true, messages: true, announcements: true },
        lastLoginAt: new Date(),
        ...(body.role === "freelancer"
          ? {
              freelancer: {
                create: {
                  headline: (body.headline || "").trim(),
                  skills: [],
                  languages: [],
                  experience: [],
                  portfolio: [],
                },
              },
            }
          : { client: { create: { company: (body.company || "").trim() } } }),
      },
      include: { freelancer: true, client: true },
    });
    return json({ token: await createToken(user.id), user: userFull(user) });
  }

  // POST /auth/login or /auth/login/:portal
  if (method === "POST" && rest[0] === "login") {
    const portal = rest[1] as "client" | "freelancer" | "admin" | undefined;
    const body = await parseBody<{ email: string; password: string }>(req);
    const email = (body.email || "").toLowerCase().trim();
    const key = clientKey(req, email);
    checkThrottle(key);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { freelancer: true, client: true },
    });
    if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
      recordFail(key);
      throw new ApiError(401, "Email or password is incorrect");
    }
    if (portal && user.role !== portal) {
      if (portal === "admin") {
        recordFail(key);
        throw new ApiError(403, "This account does not have admin access");
      }
      throw new ApiError(403, `This is a ${user.role} account. Use the ${user.role} sign-in instead.`);
    }
    if (!user.isActive) throw new ApiError(403, "This account is suspended. Contact support for help.");
    clearFails(key);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return json({ token: await createToken(user.id), user: userFull(user) });
  }

  // GET /auth/me
  if (method === "GET" && rest[0] === "me" && rest.length === 1) {
    const user = await currentUser(req);
    return json(userFull(user));
  }

  return null;
}
