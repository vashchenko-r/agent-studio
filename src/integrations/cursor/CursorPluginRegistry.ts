import * as fs from "fs";
import * as path from "path";
import type { CursorExtensionApi } from "./api";

export interface PluginRegistration {
  registered: boolean;
  pluginsRoot: string;
  agentsDir: string;
  detail: string;
}

export class CursorPluginRegistry {
  readonly agentsDir: string;

  constructor(private readonly pluginsRoot: string) {
    this.agentsDir = path.join(pluginsRoot, "agent-studio", "agents");
  }

  ensureLayout(): void {
    const pluginRoot = path.join(this.pluginsRoot, "agent-studio");
    fs.mkdirSync(path.join(pluginRoot, ".cursor-plugin"), { recursive: true });
    fs.mkdirSync(this.agentsDir, { recursive: true });
    const manifest = {
      name: "agent-studio",
      version: "0.1.0",
      description: "Optional mirror of Agent Studio agents. Populated only when agentStudio.mirrorAgentsToPlugin is enabled.",
    };
    fs.writeFileSync(path.join(pluginRoot, ".cursor-plugin", "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  register(api: CursorExtensionApi | undefined): PluginRegistration {
    this.ensureLayout();
    if (!api?.plugins.registerPath) {
      return {
        registered: false,
        pluginsRoot: this.pluginsRoot,
        agentsDir: this.agentsDir,
        detail: "vscode.cursor.plugins.registerPath is not available in this Cursor build. Agents are still written to .cursor/agents and ~/.cursor/agents, which Cursor loads directly.",
      };
    }
    api.plugins.registerPath(this.pluginsRoot);
    return {
      registered: true,
      pluginsRoot: this.pluginsRoot,
      agentsDir: this.agentsDir,
      detail: "Registered the extension storage plugin directory with vscode.cursor.plugins.registerPath. Agent files are still saved as subagents under .cursor/agents or ~/.cursor/agents. The plugin agents/ folder receives copies only when agentStudio.mirrorAgentsToPlugin is on, so Cursor does not list the same agent twice.",
    };
  }

  dispose(api: CursorExtensionApi | undefined): void {
    api?.plugins.unregisterPath(this.pluginsRoot);
  }
}
