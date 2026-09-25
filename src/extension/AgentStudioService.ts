import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import type { AgentDraft, AgentRecord, AgentScope, CapabilityReport, ContextItem, ContextPreset, OrchestraDraft, OrchestraRecord, Profile } from "../domain/types";
import type { AgentTemplate } from "../domain/types";
import { compileAgent } from "../domain/agents/compileAgent";
import { compileOrchestra, validateOrchestra } from "../domain/orchestras/compileOrchestra";
import { generateAgent } from "../domain/agents/generateAgent";
import { findProfile } from "../domain/profiles/builtinProfiles";
import { capabilityReport } from "../integrations/cursor/capabilities";
import { CursorAgentLauncher } from "../integrations/cursor/CursorAgentLauncher";
import { CursorAgentStore, type AgentRoots } from "../integrations/cursor/CursorAgentStore";
import { OrchestraStore } from "../integrations/cursor/OrchestraStore";
import { CursorContextProvider } from "../integrations/cursor/CursorContextProvider";
import { CursorPluginRegistry, type PluginRegistration } from "../integrations/cursor/CursorPluginRegistry";
import { readCursorApi } from "../integrations/cursor/api";
import { PresetRepository, ProfileRepository, TemplateRepository } from "../storage/repositories";
import type { AgentStudioViewProvider } from "./views/AgentStudioViewProvider";

export interface StudioSnapshot {
  agents: AgentRecord[];
  orchestras: OrchestraRecord[];
  profiles: Profile[];
  templates: AgentTemplate[];
  presets: ContextPreset[];
  capabilities: CapabilityReport;
  hasWorkspace: boolean;
}

export class AgentStudioService {
  private view: AgentStudioViewProvider | undefined;
  private readonly registration: PluginRegistration;
  private readonly api = readCursorApi(vscode);

  constructor(
    private readonly store: CursorAgentStore,
    private readonly orchestras: OrchestraStore,
    private readonly profiles: ProfileRepository,
    private readonly templates: TemplateRepository,
    private readonly presets: PresetRepository,
    private readonly launcher: CursorAgentLauncher,
    private readonly contextProvider: CursorContextProvider,
    registry: CursorPluginRegistry,
    private readonly roots: AgentRoots,
  ) {
    this.registration = registry.register(this.api);
  }

  attach(view: AgentStudioViewProvider): void {
    this.view = view;
  }

  dispose(): void {
    this.api?.plugins.unregisterPath(this.registration.pluginsRoot);
  }

  private listAgents(): AgentRecord[] {
    const orchestraKeys = new Set(this.orchestras.list().map((item) => `${item.scope}:${item.slug}`));
    return this.store.list().filter((agent) => !orchestraKeys.has(`${agent.scope}:${agent.slug}`));
  }

  snapshot(): StudioSnapshot {
    const mirror = vscode.workspace.getConfiguration("agentStudio").get<boolean>("mirrorAgentsToPlugin", false);
    this.roots.pluginAgentsDir = mirror ? this.registration.agentsDir : undefined;
    return {
      agents: this.listAgents(),
      orchestras: this.orchestras.list(),
      profiles: this.profiles.list(),
      templates: this.templates.list(),
      presets: this.presets.list(),
      capabilities: capabilityReport({
        pluginPathRegistration: this.registration.registered,
        pluginPathDetail: this.registration.detail,
        mcpRegistration: Boolean(this.api?.mcp?.registerServer),
      }),
      hasWorkspace: Boolean(this.roots.workspaceRoot),
    };
  }

  refresh(): void {
    this.view?.post({ type: "snapshot", snapshot: this.snapshot() });
  }

  async openStudio(): Promise<void> {
    await vscode.commands.executeCommand("agentStudio.main.focus");
  }

  showCreate(context: ContextItem[] = []): void {
    this.view?.post({ type: "create", context });
  }

  showAgent(scope: AgentScope, slug: string, screen: "editor" | "inspector"): void {
    const agent = this.store.get(scope, slug);
    if (!agent) {
      void vscode.window.showWarningMessage(`Agent Studio could not find ${slug}.`);
      return;
    }
    this.view?.post({ type: "openAgent", agent, screen });
  }

  focusSearch(): void {
    this.view?.post({ type: "focusSearch" });
  }

  async pickAgent(placeHolder: string): Promise<AgentRecord | undefined> {
    const agents = this.listAgents();
    if (agents.length === 0) {
      void vscode.window.showInformationMessage("Agent Studio has no agents yet.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      agents.map((agent) => ({
        label: agent.displayName,
        description: agent.scope === "workspace" ? "Workspace" : "Global",
        detail: agent.description,
        agent,
      })),
      { placeHolder, matchOnDescription: true, matchOnDetail: true },
    );
    return picked?.agent;
  }

  generate(prompt: string, scope: AgentScope, context: ContextItem[]): { draft: AgentDraft; note: string } {
    const taken = new Set(this.listAgents().map((agent) => agent.slug));
    const generated = generateAgent({
      prompt,
      scope,
      templates: this.templates.list(),
      profiles: this.profiles.list(),
      context,
      takenSlugs: taken,
    });
    return { draft: generated.draft, note: generated.note };
  }

  save(draft: AgentDraft): AgentRecord {
    const saved = this.store.save(draft, this.profiles.list());
    this.refresh();
    return saved;
  }

  duplicate(scope: AgentScope, slug: string): AgentRecord {
    const copy = this.store.duplicate(scope, slug, this.profiles.list());
    this.refresh();
    return copy;
  }

  delete(scope: AgentScope, slug: string): void {
    this.store.delete(scope, slug);
    this.refresh();
  }

  preview(draft: AgentDraft): { markdown: string; nativePath: string; profileName?: string } {
    const profile = findProfile(this.profiles.list(), draft.profileId);
    const compiled = compileAgent(draft, profile);
    const dir = this.store.agentsDir(draft.scope);
    return {
      markdown: compiled.markdown,
      nativePath: dir ? path.join(dir, `${draft.slug}.md`) : "(open a workspace to save a project agent)",
      profileName: profile?.name,
    };
  }

  saveOrchestra(draft: OrchestraDraft): OrchestraRecord {
    const saved = this.orchestras.save(draft, this.listAgents());
    this.refresh();
    return saved;
  }

  deleteOrchestra(scope: AgentScope, slug: string): void {
    this.orchestras.delete(scope, slug);
    this.refresh();
  }

  async runOrchestra(scope: AgentScope, slug: string): Promise<void> {
    const orchestra = this.orchestras.list().find((item) => item.scope === scope && item.slug === slug);
    if (!orchestra) {
      throw new Error(`Orchestra ${slug} was not found.`);
    }
    const agents = this.listAgents();
    const errors = validateOrchestra(orchestra, agents);
    if (errors.length > 0) {
      throw new Error(`Orchestra cannot run: ${errors.join(" ")}`);
    }
    const text = compileOrchestra(orchestra, agents);
    const result = await this.launcher.launchText(
      text,
      "Cursor cannot run an orchestra itself. A new Agent chat was opened and the step list was copied. Paste it and send it. Each step uses a /name subagent.",
    );
    this.view?.post({ type: "notice", message: result.detail });
    void vscode.window.showInformationMessage(result.detail);
  }

  async pickContext(kind: "file" | "folder" | "workspace" | "selection" | "rules" | "config"): Promise<ContextItem[]> {
    switch (kind) {
      case "file":
      case "folder":
        return this.contextProvider.pick(kind);
      case "workspace": {
        const item = this.contextProvider.workspaceItem();
        return item ? [item] : [];
      }
      case "selection": {
        const item = this.contextProvider.selectionItem();
        return item ? [item] : [];
      }
      case "rules":
        return this.contextProvider.projectRules();
      case "config":
        return this.contextProvider.configurationFiles();
      default:
        return [];
    }
  }

  saveProfile(profile: Omit<Profile, "builtin" | "id"> & { id?: string }): Profile {
    const saved = this.profiles.save(profile);
    this.refresh();
    return saved;
  }

  deleteProfile(id: string): void {
    this.profiles.delete(id);
    this.refresh();
  }

  savePreset(name: string, context: ContextItem[]): ContextPreset {
    const preset = this.presets.save(name, context);
    this.refresh();
    return preset;
  }
}

export function createService(context: vscode.ExtensionContext, workspaceRoot: string | undefined): AgentStudioService {
  const storage = context.globalStorageUri.fsPath;
  const roots: AgentRoots = {
    workspaceRoot,
    userAgentsDir: path.join(os.homedir(), ".cursor", "agents"),
    userStudioDir: path.join(os.homedir(), ".cursor", "agent-studio"),
  };
  const registry = new CursorPluginRegistry(path.join(storage, "plugins"));
  const store = new CursorAgentStore(roots);
  const launcher = new CursorAgentLauncher(vscode.commands, vscode.env.clipboard);
  return new AgentStudioService(
    store,
    new OrchestraStore(roots),
    new ProfileRepository(path.join(storage, "profiles.json")),
    new TemplateRepository(path.join(storage, "templates.json")),
    new PresetRepository(workspaceRoot ? path.join(workspaceRoot, ".cursor", "agent-studio", "presets.json") : undefined),
    launcher,
    new CursorContextProvider(),
    registry,
    roots,
  );
}
