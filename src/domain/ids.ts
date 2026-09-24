export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "agent";
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
