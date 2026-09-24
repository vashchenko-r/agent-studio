import * as fs from "fs";
import * as path from "path";
import type { AgentRecord, AgentScope, OrchestraDraft, OrchestraRecord } from "../../domain/types";
import { compileOrchestra, compileOrchestraAgent, validateOrchestra } from "../../domain/orchestras/compileOrchestra";
import { assertSafeSlug, nowIso, slugify, uniqueSlug } from "../../domain/ids";

export interface OrchestraRoots {
  workspaceRoot?: string;
  userStudioDir: string;
  userAgentsDir: string;
}

interface Sidecar extends OrchestraDraft {
  createdAt: string;
  updatedAt: string;
}

function isSidecar(value: unknown): value is Sidecar {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<Sidecar>;
  return (
    typeof item.slug === "string" &&
    item.slug === slugify(item.slug) &&
    typeof item.displayName === "string" &&
    typeof item.description === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    Array.isArray(item.steps) &&
    item.steps.every(
      (step) =>
        step &&
        (step.scope === "workspace" || step.scope === "global") &&
        typeof step.slug === "string" &&
        typeof step.task === "string",
    )
  );
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

function safeRecordPath(dir: string, slug: unknown, extension: ".md" | ".json"): string {
  assertSafeSlug(slug);
  const root = path.resolve(dir);
  const target = path.resolve(root, `${slug}${extension}`);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Orchestra path escaped its storage directory.");
  }
  return target;
}

function writeAtomic(file: string, content: string): void {
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

function coordinatorMarker(slug: string): string {
  return `<!-- agent-studio:orchestra:${slug} -->`;
}

export class OrchestraStore {
  constructor(private readonly roots: OrchestraRoots) {}

  private dir(scope: AgentScope): string | undefined {
    if (scope === "global") {
      return path.join(this.roots.userStudioDir, "orchestras");
    }
    if (scope === "workspace") {
      return this.roots.workspaceRoot
        ? path.join(this.roots.workspaceRoot, ".cursor", "agent-studio", "orchestras")
        : undefined;
    }
    throw new Error("Invalid orchestra scope.");
  }

  list(): OrchestraRecord[] {
    const records: OrchestraRecord[] = [];
    for (const scope of ["workspace", "global"] as const) {
      const dir = this.dir(scope);
      if (!dir || !fs.existsSync(dir)) {
        continue;
      }
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".json")) {
          continue;
        }
        const sidecar = readJson<unknown>(path.join(dir, file));
        if (!isSidecar(sidecar)) {
          continue;
        }
        records.push({
          ...sidecar,
          scope,
          steps: sidecar.steps ?? [],
          nativePath: path.join(dir, `${sidecar.slug}.md`),
        });
      }
    }
    return records.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  save(draft: OrchestraDraft, agents: AgentRecord[]): OrchestraRecord {
    const dir = this.dir(draft.scope);
    if (!dir) {
      throw new Error("Open a workspace folder before saving a project orchestra.");
    }
    const updating = Boolean(draft.originalSlug);
    const requested = slugify(draft.slug || draft.displayName);
    if (updating) {
      assertSafeSlug(draft.originalSlug);
      if (draft.originalScope !== draft.scope) {
        throw new Error("Moving an orchestra between workspace and global scope is not supported. Create a new orchestra instead.");
      }
      if (draft.originalSlug !== requested) {
        throw new Error("Renaming an existing orchestra is not supported. Create a new orchestra instead.");
      }
    }
    const existingValue = readJson<unknown>(path.join(dir, `${requested}.json`));
    const existing = isSidecar(existingValue) ? existingValue : undefined;
    if (updating && !existing) {
      throw new Error(`Orchestra ${requested} no longer exists. Refresh Agent Studio before saving.`);
    }
    if (!updating && existing) {
      throw new Error(`An orchestra named ${requested} already exists. Choose another name.`);
    }
    const taken = new Set(
      [
        ...this.list()
          .filter((item) => item.scope === draft.scope && item.slug !== requested)
          .map((item) => item.slug),
        ...agents
          .filter((item) => item.scope === draft.scope && (item.slug !== requested || !existing))
          .map((item) => item.slug),
      ],
    );
    const slug = taken.has(requested) ? uniqueSlug(requested, taken) : requested;
    const next: OrchestraDraft = {
      slug,
      scope: draft.scope,
      displayName: draft.displayName,
      description: draft.description,
      steps: draft.steps.filter((step) => step.slug),
    };
    if (next.steps.length === 0) {
      throw new Error("Add at least one agent to the orchestra.");
    }
    const errors = validateOrchestra(next, agents);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    ensureDir(dir);
    const nativePath = path.join(dir, `${slug}.md`);
    const record: Sidecar = {
      ...next,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    const agentsDir = this.agentsDir(draft.scope);
    let coordinatorPath: string | undefined;
    if (agentsDir) {
      ensureDir(agentsDir);
      coordinatorPath = safeRecordPath(agentsDir, slug, ".md");
      if (fs.existsSync(coordinatorPath)) {
        const current = fs.readFileSync(coordinatorPath, "utf8");
        if (!current.includes(coordinatorMarker(slug))) {
          throw new Error(`Refusing to overwrite ${coordinatorPath} because it is not owned by this orchestra.`);
        }
      }
    }
    writeAtomic(nativePath, compileOrchestra(next, agents));
    if (coordinatorPath) {
      writeAtomic(coordinatorPath, compileOrchestraAgent(next, agents));
    }
    writeAtomic(path.join(dir, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
    return { ...record, nativePath: agentsDir ? path.join(agentsDir, `${slug}.md`) : nativePath };
  }

  private agentsDir(scope: AgentScope): string | undefined {
    if (scope === "global") {
      return this.roots.userAgentsDir;
    }
    if (scope === "workspace") {
      return this.roots.workspaceRoot ? path.join(this.roots.workspaceRoot, ".cursor", "agents") : undefined;
    }
    throw new Error("Invalid orchestra scope.");
  }

  delete(scope: AgentScope, slug: string): void {
    const dir = this.dir(scope);
    if (!dir) {
      return;
    }
    fs.rmSync(safeRecordPath(dir, slug, ".json"), { force: true });
    fs.rmSync(safeRecordPath(dir, slug, ".md"), { force: true });
    const agentsDir = this.agentsDir(scope);
    if (agentsDir) {
      const coordinatorPath = safeRecordPath(agentsDir, slug, ".md");
      if (
        fs.existsSync(coordinatorPath) &&
        fs.readFileSync(coordinatorPath, "utf8").includes(coordinatorMarker(slug))
      ) {
        fs.rmSync(coordinatorPath, { force: true });
      }
    }
  }
}
