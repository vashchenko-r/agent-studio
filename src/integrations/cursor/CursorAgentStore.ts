import * as fs from "fs";
import * as path from "path";
import type { AgentDraft, AgentRecord, AgentScope, Profile } from "../../domain/types";
import { compileAgent } from "../../domain/agents/compileAgent";
import { draftFromMarkdown } from "../../domain/agents/parseAgent";
import { assertSafeSlug, nowIso, slugify, uniqueSlug, withGlobalDisplayPrefix, withGlobalSlugPrefix } from "../../domain/ids";

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
  /** Unprefixed slug this global agent used before it was renamed. */
  previousSlug?: string;
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

function replaceFrontmatterName(markdown: string, slug: string): string {
  return markdown.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_full, body: string) => {
    const next = /^name:/m.test(body) ? body.replace(/^name:.*$/m, `name: ${slug}`) : `name: ${slug}\n${body}`;
    return `---\n${next}\n---`;
  });
}

function replaceHeading(markdown: string, displayName: string): string {
  if (!displayName || !/^#\s+.+$/m.test(markdown)) {
    return markdown;
  }
  return markdown.replace(/^#\s+.+$/m, `# ${displayName}`);
}

type ListedAgent = AgentRecord & { previousSlug?: string };

export class CursorAgentStore {
  private migrating = false;

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
    this.migrateGlobalSlugs();
    return this.readAll();
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
    const raw = slugify(draft.slug || draft.displayName);
    const requested = draft.scope === "global" ? withGlobalSlugPrefix(raw) : raw;
    const displayName = draft.scope === "global" ? withGlobalDisplayPrefix(draft.displayName) : draft.displayName;
    const catalog = this.readAll();
    const owned = catalog.find(
      (agent) => agent.scope === draft.scope && (agent.slug === raw || agent.previousSlug === raw),
    );
    const existing =
      (owned ? this.readSidecar(draft.scope, owned.slug) : undefined) ??
      this.readSidecar(draft.scope, requested) ??
      (raw === requested ? undefined : this.readSidecar(draft.scope, raw));
    const taken = new Set(
      catalog.filter((agent) => agent.scope === draft.scope && agent.slug !== owned?.slug).map((agent) => agent.slug),
    );
    const slug = taken.has(requested) ? uniqueSlug(requested, taken) : requested;
    const otherScope = draft.scope === "workspace" ? "global" : "workspace";
    const other = catalog.find((agent) => agent.scope === otherScope && agent.slug === slug);
    if (other && !this.readSidecar(draft.scope, slug)) {
      throw new Error(
        `/${slug} already exists as a ${otherScope} agent. Cursor calls agents by slug, so a ${draft.scope} copy would be ambiguous. Rename this agent or delete the ${otherScope} one.`,
      );
    }
    const next: AgentDraft = { ...draft, slug, displayName };
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
      previousSlug: existing?.previousSlug,
    };
    delete (record as Sidecar & { nativePath?: string; persistedSlug?: boolean }).nativePath;
    delete (record as Sidecar & { persistedSlug?: boolean }).persistedSlug;
    writeJson(path.join(studio, `${slug}.json`), record);
    if (owned && owned.slug !== slug) {
      this.delete(draft.scope, owned.slug);
    }
    if (raw !== slug && raw !== owned?.slug) {
      this.delete(draft.scope, raw);
    }
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
    assertSafeSlug(slug);
    const nativeDir = this.agentsDir(scope);
    const studio = this.studioDir(scope);
    const ids = new Set<string>([slug]);
    for (const agent of this.readAll()) {
      if (agent.scope !== scope) {
        continue;
      }
      const fileSlug = path.basename(agent.nativePath, ".md");
      if (agent.slug !== slug && fileSlug !== slug) {
        continue;
      }
      for (const id of [agent.slug, fileSlug]) {
        if (id === slugify(id)) {
          ids.add(id);
        }
      }
    }
    for (const id of ids) {
      if (nativeDir) {
        fs.rmSync(safeRecordPath(nativeDir, id, ".md"), { force: true });
      }
      if (studio) {
        fs.rmSync(safeRecordPath(studio, id, ".json"), { force: true });
      }
      if (this.roots.pluginAgentsDir) {
        fs.rmSync(safeRecordPath(this.roots.pluginAgentsDir, `${scope}-${id}`, ".md"), { force: true });
      }
    }
  }

  private migrateGlobalSlugs(): void {
    if (this.migrating) {
      return;
    }
    const dir = this.agentsDir("global");
    if (!dir || !fs.existsSync(dir)) {
      return;
    }
    this.migrating = true;
    try {
      const studio = this.studioDir("global");
      const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md"));
      const taken = new Set(files.map((file) => file.slice(0, -3)).filter((slug) => slug.startsWith("global-")));
      for (const file of files) {
        const slug = file.slice(0, -3);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.startsWith("global-")) {
          continue;
        }
        let next = withGlobalSlugPrefix(slug);
        if (taken.has(next)) {
          next = uniqueSlug(next, taken);
        }
        taken.add(next);
        const source = path.join(dir, file);
        const markdown = fs.readFileSync(source, "utf8");
        const heading = /^#\s+(.+)\s*$/m.exec(markdown)?.[1]?.trim() ?? "";
        const displayName = withGlobalDisplayPrefix(heading);
        const rewritten = replaceHeading(replaceFrontmatterName(markdown, next), displayName);
        const target = safeRecordPath(dir, next, ".md");
        writeAtomic(target, rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`);
        fs.rmSync(source, { force: true });
        if (studio) {
          const sidecar = readJson<Sidecar>(path.join(studio, `${slug}.json`));
          if (sidecar) {
            writeJson(safeRecordPath(studio, next, ".json"), {
              ...sidecar,
              slug: next,
              displayName: withGlobalDisplayPrefix(sidecar.displayName || displayName),
              nativePath: target,
              previousSlug: slug,
              updatedAt: nowIso(),
            });
            fs.rmSync(path.join(studio, `${slug}.json`), { force: true });
          }
        }
        this.renamePluginMirror(slug, next, displayName);
      }
    } finally {
      this.migrating = false;
    }
  }

  private renamePluginMirror(slug: string, next: string, displayName: string): void {
    if (!this.roots.pluginAgentsDir) {
      return;
    }
    const source = path.join(this.roots.pluginAgentsDir, `global-${slug}.md`);
    if (!fs.existsSync(source)) {
      return;
    }
    const markdown = fs.readFileSync(source, "utf8");
    const rewritten = replaceHeading(replaceFrontmatterName(markdown, next), displayName);
    writeAtomic(
      safeRecordPath(this.roots.pluginAgentsDir, `global-${next}`, ".md"),
      rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`,
    );
    fs.rmSync(source, { force: true });
  }

  private readAll(): ListedAgent[] {
    const records = new Map<string, ListedAgent>();
    for (const scope of ["workspace", "global"] as const) {
      this.readScope(scope, records);
    }
    return [...records.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private readScope(scope: AgentScope, into: Map<string, ListedAgent>): void {
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
