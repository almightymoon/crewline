/**
 * - On Vercel / Postgres DATABASE_URL: flip provider to postgresql
 * - Ensure DATABASE_URL exists for `prisma generate` (prisma.config requires it)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");
const envPath = join(root, ".env");

const url = process.env.DATABASE_URL || "";
const wantsPg =
  process.env.VERCEL === "1" ||
  url.startsWith("postgresql://") ||
  url.startsWith("postgres://");

let schema = readFileSync(schemaPath, "utf8");
if (wantsPg && /provider\s*=\s*"sqlite"/.test(schema)) {
  schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  writeFileSync(schemaPath, schema);
  console.log("Prisma provider → postgresql");
} else if (!wantsPg && /provider\s*=\s*"postgresql"/.test(schema)) {
  schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
  writeFileSync(schemaPath, schema);
  console.log("Prisma provider → sqlite");
} else {
  console.log(`Prisma provider unchanged (${wantsPg ? "postgresql" : "sqlite"})`);
}

// prisma.config.ts calls env("DATABASE_URL") — provide a build-time fallback
if (!process.env.DATABASE_URL) {
  const fallback = wantsPg
    ? "postgresql://build:build@127.0.0.1:5432/build?schema=public"
    : "file:./dev.db";
  process.env.DATABASE_URL = fallback;
  if (!existsSync(envPath)) {
    writeFileSync(
      envPath,
      `DATABASE_URL="${fallback}"\nSECRET_KEY="dev-only-change-me"\n`,
    );
  } else {
    const cur = readFileSync(envPath, "utf8");
    if (!/^DATABASE_URL=/m.test(cur)) {
      writeFileSync(envPath, `DATABASE_URL="${fallback}"\n` + cur);
    }
  }
  console.log("Set fallback DATABASE_URL for prisma generate");
}
