import * as fs from "fs";
import * as path from "path";
import type { AgentDraft, AgentRecord, AgentScope, Profile } from "../../domain/types";
import { compileAgent } from "../../domain/agents/compileAgent";
import { draftFromMarkdown } from "../../domain/agents/parseAgent";
import { assertSafeSlug, nowIso, slugify, uniqueSlug } from "../../domain/ids";

export interface AgentRoots {
  workspaceRoot?: string;
  userAgentsDir: string;
  userStudioDir: string;
  pluginAgentsDir?: string;
}

interface Sidecar extends AgentDraft {
  createdAt: string;
  updatedAt: string;
  imported: boolean;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeAtomic(file: string, content: string): void {
  ensureDir(path.dirname(file));
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
    throw new Error(`Refusing to overwrite symbolic link: ${file}`);
  }
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, "utf8");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function writeJson(file: string, value: unknown): void {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function safeRecordPath(dir: string, slug: unknown, extension: ".md" | ".json"): string {
  assertSafeSlug(slug);
  const root = path.resolve(dir);
  const target = path.resolve(root, `${slug}${extension}`);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Agent path escaped its storage directory.");
  }
  return target;
}

export class CursorAgentStore {
  constructor(private readonly roots: AgentRoots) {}

  agentsDir(scope: AgentScope): string | undefined {
    if (scope === "global") {
      return this.roots.userAgentsDir;
    }
    if (scope === "workspace") {
      return this.roots.workspaceRoot ? path.join(this.roots.workspaceRoot, ".cursor", "agents") : undefined;
    }
    throw new Error("Invalid agent scope.");
  }

  studioDir(scope: AgentScope): string | undefined {
    if (scope === "global") {
      return this.roots.userStudioDir;
    }
    if (scope === "workspace") {
      return this.roots.workspaceRoot ? path.join(this.roots.workspaceRoot, ".cursor", "agent-studio") : undefined;
    }
    throw new Error("Invalid agent scope.");
  }

  list(): AgentRecord[] {
    const records = new Map<string, AgentRecord>();
    for (const scope of ["workspace", "global"] as const) {
      this.readScope(scope, records);
    }
    return [...records.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  get(scope: AgentScope, slug: string): AgentRecord | undefined {
    return this.list().find((agent) => agent.scope === scope && agent.slug === slug);
  }

  save(draft: AgentDraft, profiles: Profile[]): AgentRecord {
    const dir = this.agentsDir(draft.scope);
    const studio = this.studioDir(draft.scope);
    if (!dir || !studio) {
      throw new Error("Open a workspace folder before saving a project agent.");
    }
    const requested = slugify(draft.slug || draft.displayName);
    const existing = this.readSidecar(draft.scope, requested);
    const taken = new Set(
      this.list()
        .filter((agent) => agent.scope === draft.scope && agent.slug !== requested)
        .map((agent) => agent.slug),
    );
    const slug = taken.has(requested) ? uniqueSlug(requested, taken) : requested;
    const next: AgentDraft = { ...draft, slug };
    const profile = profiles.find((item) => item.id === next.profileId);
    const compiled = compileAgent(next, profile);
    ensureDir(dir);
    const nativePath = safeRecordPath(dir, slug, ".md");
    writeAtomic(nativePath, compiled.markdown);
    if (this.roots.pluginAgentsDir) {
      ensureDir(this.roots.pluginAgentsDir);
      writeAtomic(
        safeRecordPath(this.roots.pluginAgentsDir, `${draft.scope}-${slug}`, ".md"),
        compiled.markdown,
      );
    }
    const record: Sidecar = {
      ...next,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      imported: false,
    };
    writeJson(path.join(studio, `${slug}.json`), record);
    return { ...record, nativePath };
  }

  duplicate(scope: AgentScope, slug: string, profiles: Profile[]): AgentRecord {
    const source = this.get(scope, slug);
    if (!source) {
      throw new Error(`Agent ${slug} was not found.`);
    }
    const taken = new Set(this.list().filter((agent) => agent.scope === scope).map((agent) => agent.slug));
    const copySlug = uniqueSlug(`${source.slug}-copy`, taken);
    return this.save(
      {
        ...source,
        slug: copySlug,
        displayName: `${source.displayName} Copy`,
      },
      profiles,
    );
  }

  delete(scope: AgentScope, slug: string): void {
    const native = this.agentsDir(scope);
    const studio = this.studioDir(scope);
    if (native) {
      fs.rmSync(safeRecordPath(native, slug, ".md"), { force: true });
    }
    if (studio) {
      fs.rmSync(safeRecordPath(studio, slug, ".json"), { force: true });
    }
    if (this.roots.pluginAgentsDir) {
      const pluginSlug = `${scope}-${slug}`;
      fs.rmSync(safeRecordPath(this.roots.pluginAgentsDir, pluginSlug, ".md"), { force: true });
    }
  }

  private readScope(scope: AgentScope, into: Map<string, AgentRecord>): void {
    const nativeDir = this.agentsDir(scope);
    const studio = this.studioDir(scope);
    if (!nativeDir) {
      return;
    }
    const sidecars = new Map<string, Sidecar>();
    if (studio && fs.existsSync(studio)) {
      for (const file of fs.readdirSync(studio)) {
        if (!file.endsWith(".json") || file === "presets.json") {
          continue;
        }
        const sidecar = readJson<Sidecar>(path.join(studio, file));
        if (sidecar?.slug) {
          sidecars.set(sidecar.slug, sidecar);
        }
      }
    }
    if (!fs.existsSync(nativeDir)) {
      return;
    }
    for (const file of fs.readdirSync(nativeDir)) {
      if (!file.endsWith(".md")) {
        continue;
      }
      const slug = file.slice(0, -3);
      const nativePath = path.join(nativeDir, file);
      const sidecar = sidecars.get(slug);
      if (sidecar) {
        into.set(`${scope}:${slug}`, { ...sidecar, scope, nativePath });
        continue;
      }
      const markdown = fs.readFileSync(nativePath, "utf8");
      const draft = draftFromMarkdown(markdown, slug, scope, "✦");
      const stat = fs.statSync(nativePath);
      into.set(`${scope}:${draft.slug}`, {
        ...draft,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        nativePath,
        imported: true,
      });
    }
  }

  private readSidecar(scope: AgentScope, slug: string): Sidecar | undefined {
    const studio = this.studioDir(scope);
    if (!studio) {
      return undefined;
    }
    return readJson<Sidecar>(path.join(studio, `${slug}.json`));
  }
}
