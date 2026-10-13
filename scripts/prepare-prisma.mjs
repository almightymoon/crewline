/**
 * On Vercel / when DATABASE_URL is Postgres, flip the Prisma provider to postgresql
 * so the same repo works with local SQLite and hosted Postgres.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");
const url = process.env.DATABASE_URL || "";

const wantsPg =
  process.env.VERCEL === "1" ||
  url.startsWith("postgresql://") ||
  url.startsWith("postgres://");

let schema = readFileSync(schemaPath, "utf8");
if (wantsPg) {
  schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  writeFileSync(schemaPath, schema);
  console.log("Prisma provider → postgresql");
} else {
  console.log("Prisma provider → sqlite (local)");
}
