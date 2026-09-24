import type { AgentDraft, AgentTemplate, ContextItem, Profile } from "../types";
import { matchTemplate } from "../templates/builtinTemplates";
import { slugify } from "../ids";

export interface GeneratedAgent {
  draft: AgentDraft;
  templateId?: string;
  profileId?: string;
  note: string;
}

function titleFromPrompt(prompt: string, fallback: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  const named = /(?:called|named)\s+"([^"]+)"/i.exec(cleaned) ?? /(?:called|named)\s+'([^']+)'/i.exec(cleaned);
  if (named?.[1]) {
    return named[1].trim();
  }
  if (fallback !== "New Agent") {
    return fallback;
  }
  const words = cleaned.split(" ").slice(0, 4).join(" ");
  return words.length > 48 ? `${words.slice(0, 45).trim()}…` : words || "New Agent";
}

export function generateAgent(input: {
  prompt: string;
  scope: AgentDraft["scope"];
  templates: AgentTemplate[];
  profiles: Profile[];
  context?: ContextItem[];
  takenSlugs: ReadonlySet<string>;
}): GeneratedAgent {
  const prompt = input.prompt.trim();
  const matched = matchTemplate(input.templates, prompt);
  const base = matched?.draft;
  const displayName = titleFromPrompt(prompt, matched?.name ?? "New Agent");
  let slug = slugify(displayName);
  if (input.takenSlugs.has(slug)) {
    let index = 2;
    while (input.takenSlugs.has(`${slug}-${index}`)) {
      index += 1;
    }
    slug = `${slug}-${index}`;
  }
  const profileId = base?.profileId;
  const profile = input.profiles.find((item) => item.id === profileId);
  const draft: AgentDraft = {
    slug,
    scope: input.scope,
    icon: base?.icon ?? "✦",
    displayName,
    description: base?.description ?? `Use when a task requires this specialty: ${prompt}`,
    role: base?.role ?? "You are a specialist for the task below.",
    instructions: [prompt, base?.instructions].filter(Boolean).join("\n\n"),
    responsibilities: base?.responsibilities ?? ["Do the requested work inside this specialty"],
    constraints: base?.constraints ?? ["Stay inside the requested specialty"],
    context: input.context ?? [],
    profileId,
    readonly: base?.readonly ?? false,
    isBackground: base?.isBackground ?? false,
    model: "inherit",
    outputFormat: base?.outputFormat ?? "",
    behavior: base?.behavior ?? "Prefer the smallest change that solves the task.",
    projectRules: "",
    skills: "",
    mcpNote: "",
    hooksNote: "",
    environmentNote: "",
  };
  const note = matched
    ? `Structured from your description using the ${matched.name} template${profile ? ` and the ${profile.name} profile` : ""}. Review it before saving. This step is local keyword matching, not a model call.`
    : "Structured from your description without a matching template. Review it before saving. This step is local keyword matching, not a model call.";
  return { draft, templateId: matched?.id, profileId, note };
}
