export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "agent";
}

const GLOBAL_SLUG_PREFIX = "global-";

/** Cursor calls an agent by slug, so a global agent must not take the short name a project agent uses. */
export function withGlobalSlugPrefix(slug: string): string {
  const safe = slugify(slug);
  if (safe === "global" || safe.startsWith(GLOBAL_SLUG_PREFIX)) {
    return safe;
  }
  return `${GLOBAL_SLUG_PREFIX}${safe}`;
}

export function withGlobalDisplayPrefix(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed || /^global\b/i.test(trimmed)) {
    return trimmed;
  }
  return `Global ${trimmed}`;
}

export function assertSafeSlug(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value !== slugify(value) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new Error("Invalid agent identifier.");
  }
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) {
    return root;
  }
  let index = 2;
  while (taken.has(`${root}-${index}`)) {
    index += 1;
  }
  return `${root}-${index}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
