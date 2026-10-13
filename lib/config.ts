export const SECRET_KEY = process.env.SECRET_KEY || "dev-only-change-me";
export const TOKEN_HOURS = Number(process.env.TOKEN_HOURS || 24 * 7);
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@crewline.dev";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";

export const DEFAULT_SETTINGS = {
  buyer_fee_pct: 5,
  seller_fee_pct: 10,
  signups_enabled: true,
};

export const CATEGORIES: [string, string][] = [
  ["design", "Design"],
  ["dev", "Development"],
  ["writing", "Writing"],
  ["video", "Video and motion"],
  ["marketing", "Marketing"],
  ["data", "Data and AI"],
  ["audio", "Audio"],
];

export const CATEGORY_IMAGES: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(([c]) => [c, `/assets/categories/${c}.jpg`]),
);

export const VALID_CATS = new Set(CATEGORIES.map(([c]) => c));
export const COLORS = [
  "#0071e3",
  "#5e5ce6",
  "#bf5af2",
  "#ff375f",
  "#ff9f0a",
  "#30b0c7",
  "#34c759",
  "#ac8e68",
];
export const LIVE = ["funded", "in_progress", "delivered", "revision"] as const;
