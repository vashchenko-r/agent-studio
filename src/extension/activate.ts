import * as vscode from "vscode";
import { registerCommands } from "./commands/registerCommands";
import { createService } from "./AgentStudioService";
import { AgentStudioViewProvider } from "./views/AgentStudioViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const service = createService(context, workspaceRoot);
  const provider = new AgentStudioViewProvider(context, service);
  service.attach(provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentStudioViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  registerCommands(context, service);
  context.subscriptions.push({ dispose: () => service.dispose() });
}

export function deactivate(): void {
  return undefined;
}
