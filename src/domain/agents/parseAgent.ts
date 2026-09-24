import type { AgentDraft, ContextItem } from "../types";
import { slugify } from "../ids";

export interface ParsedSubagent {
  slug: string;
  displayName: string;
  description: string;
  model: string;
  readonly: boolean;
  isBackground: boolean;
  body: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed.startsWith("'") ? `"${trimmed.slice(1, -1)}"` : trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function parseSubagentMarkdown(markdown: string, fallbackSlug: string): ParsedSubagent {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  const rawFrontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? markdown).replace(/^\n/, "");
  const fields = new Map<string, string>();
  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    fields.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1)));
  }
  const heading = /^#\s+(.+)\s*$/m.exec(body);
  const slug = slugify(fields.get("name") || fallbackSlug);
  return {
    slug,
    displayName: heading?.[1]?.trim() || fields.get("name") || fallbackSlug,
    description: fields.get("description") ?? "",
    model: fields.get("model") || "inherit",
    readonly: fields.get("readonly") === "true",
    isBackground: fields.get("is_background") === "true",
    body: body.trim(),
  };
}

function section(body: string, title: string): string {
  const pattern = new RegExp(`^## ${title}\\s*$`, "m");
  const start = pattern.exec(body);
  if (!start) {
    return "";
  }
  const from = start.index + start[0].length;
  const rest = body.slice(from);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function bullets(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
}

function parseContext(block: string): ContextItem[] {
  const items: ContextItem[] = [];
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const match = /^- (file|folder|workspace|selection|rule|config): `([^`]+)`/.exec(line.trim());
    if (!match) {
      continue;
    }
    const kind = match[1] as ContextItem["kind"];
    const path = match[2];
    items.push({
      id: `${kind}:${path}`,
      kind,
      path,
      label: path.split("/").pop() || path,
    });
  }
  return items;
}

export function draftFromMarkdown(markdown: string, fallbackSlug: string, scope: AgentDraft["scope"], icon: string): AgentDraft {
  const parsed = parseSubagentMarkdown(markdown, fallbackSlug);
  const responsibilities = section(parsed.body, "Responsibilities");
  const constraints = section(parsed.body, "Constraints");
  const context = section(parsed.body, "Context");
  const introEnd = parsed.body.search(/^## /m);
  const intro = (introEnd === -1 ? parsed.body : parsed.body.slice(0, introEnd)).replace(/^#\s+.+\n+/, "").trim();
  const paragraphs = intro.split(/\n\n/).map((part) => part.trim()).filter(Boolean);
  return {
    slug: parsed.slug,
    scope,
    icon,
    displayName: parsed.displayName,
    description: parsed.description,
    role: paragraphs[0] ?? "",
    instructions: paragraphs.slice(1).join("\n\n"),
    responsibilities: bullets(responsibilities),
    constraints: bullets(constraints),
    context: parseContext(context),
    readonly: parsed.readonly,
    isBackground: parsed.isBackground,
    model: parsed.model,
    outputFormat: section(parsed.body, "Output"),
    behavior: section(parsed.body, "Behavior"),
    projectRules: section(parsed.body, "Project rules"),
    skills: section(parsed.body, "Skills"),
    mcpNote: "",
    hooksNote: "",
    environmentNote: "",
  };
}
