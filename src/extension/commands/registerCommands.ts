import * as vscode from "vscode";
import type { AgentStudioService } from "../AgentStudioService";
import type { AgentScope } from "../../domain/types";

async function chooseScope(hasWorkspace: boolean): Promise<AgentScope | undefined> {
  if (!hasWorkspace) {
    return "global";
  }
  const picked = await vscode.window.showQuickPick(
    [
      { label: "Workspace", description: "This project", scope: "workspace" as const },
      { label: "Global", description: "All projects", scope: "global" as const },
    ],
    { placeHolder: "Where should this agent live?" },
  );
  return picked?.scope;
}

export function registerCommands(context: vscode.ExtensionContext, service: AgentStudioService): void {
  const register = (id: string, handler: () => Promise<void> | void) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register("agentStudio.open", async () => {
    await service.openStudio();
    service.refresh();
  });

  register("agentStudio.newAgent", async () => {
    await service.openStudio();
    service.showCreate();
  });

  register("agentStudio.searchAgents", async () => {
    await service.openStudio();
    service.focusSearch();
  });

  register("agentStudio.duplicateAgent", async () => {
    const agent = await service.pickAgent("Duplicate agent");
    if (!agent) {
      return;
    }
    const copy = service.duplicate(agent.scope, agent.slug);
    await service.openStudio();
    service.showAgent(copy.scope, copy.slug, "editor");
  });

  register("agentStudio.editAgent", async () => {
    const agent = await service.pickAgent("Edit agent");
    if (!agent) {
      return;
    }
    await service.openStudio();
    service.showAgent(agent.scope, agent.slug, "editor");
  });

  register("agentStudio.previewAgent", async () => {
    const agent = await service.pickAgent("Preview agent");
    if (!agent) {
      return;
    }
    await service.openStudio();
    service.showAgent(agent.scope, agent.slug, "inspector");
  });

  register("agentStudio.createFromSelection", async () => {
    const items = await service.pickContext("selection");
    if (items.length === 0) {
      void vscode.window.showInformationMessage("Select code in the editor first.");
      return;
    }
    const scope = await chooseScope(service.snapshot().hasWorkspace);
    if (!scope) {
      return;
    }
    await service.openStudio();
    service.showCreate(items.map((item) => ({ ...item })));
    service.refresh();
    void vscode.window.showInformationMessage("Describe the specialty. The selection is already attached as context.");
  });
}
