import * as vscode from "vscode";
import type { AgentStudioService, StudioSnapshot } from "../AgentStudioService";
import type { AgentDraft, AgentRecord, AgentScope, ContextItem, OrchestraDraft, OrchestraRecord } from "../../domain/types";

type HostMessage =
  | { type: "ready" }
  | { type: "generate"; prompt: string; scope: AgentScope; context: ContextItem[] }
  | { type: "save"; draft: AgentDraft }
  | { type: "duplicate"; scope: AgentScope; slug: string }
  | { type: "delete"; scope: AgentScope; slug: string }
  | { type: "preview"; draft: AgentDraft }
  | { type: "pickContext"; kind: "file" | "folder" | "workspace" | "selection" | "rules" | "config" }
  | { type: "saveProfile"; profile: { id?: string; name: string; summary: string; expertise: string[]; principles: string[]; communication: string[] } }
  | { type: "deleteProfile"; id: string }
  | { type: "savePreset"; name: string; context: ContextItem[] }
  | { type: "saveOrchestra"; draft: OrchestraDraft }
  | { type: "deleteOrchestra"; scope: AgentScope; slug: string }
  | { type: "runOrchestra"; scope: AgentScope; slug: string };

export type ViewMessage =
  | { type: "snapshot"; snapshot: StudioSnapshot }
  | { type: "create"; context: ContextItem[] }
  | { type: "openAgent"; agent: AgentRecord; screen: "editor" | "inspector" }
  | { type: "focusSearch" }
  | { type: "generated"; draft: AgentDraft; note: string }
  | { type: "previewResult"; markdown: string; nativePath: string; profileName?: string }
  | { type: "contextPicked"; items: ContextItem[] }
  | { type: "notice"; message: string }
  | { type: "saved"; agent: AgentRecord }
  | { type: "orchestraSaved"; orchestra: OrchestraRecord };

export class AgentStudioViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "agentStudio.main";
  private view: vscode.WebviewView | undefined;
  private ready = false;
  private queued: ViewMessage[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly service: AgentStudioService,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = this.html(webview);
    webview.onDidReceiveMessage((message: HostMessage) => {
      void this.onMessage(message);
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }

  post(message: ViewMessage): void {
    if (!this.ready || !this.view) {
      this.queued.push(message);
      return;
    }
    void this.view.webview.postMessage(message);
  }

  private async onMessage(message: HostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "ready": {
          this.ready = true;
          const queued = this.queued;
          this.queued = [];
          void this.view?.webview.postMessage({ type: "snapshot", snapshot: this.service.snapshot() });
          for (const queuedMessage of queued) {
            void this.view?.webview.postMessage(queuedMessage);
          }
          return;
        }
        case "generate": {
          const generated = this.service.generate(message.prompt, message.scope, message.context);
          this.post({ type: "generated", draft: generated.draft, note: generated.note });
          return;
        }
        case "save":
          this.post({ type: "saved", agent: this.service.save(message.draft) });
          return;
        case "duplicate":
          this.post({ type: "saved", agent: this.service.duplicate(message.scope, message.slug) });
          return;
        case "delete":
          this.service.delete(message.scope, message.slug);
          return;
        case "preview":
          this.post({ type: "previewResult", ...this.service.preview(message.draft) });
          return;
        case "pickContext":
          this.post({ type: "contextPicked", items: await this.service.pickContext(message.kind) });
          return;
        case "saveProfile":
          this.service.saveProfile(message.profile);
          return;
        case "deleteProfile":
          this.service.deleteProfile(message.id);
          return;
        case "savePreset":
          this.service.savePreset(message.name, message.context);
          return;
        case "saveOrchestra":
          this.post({ type: "orchestraSaved", orchestra: this.service.saveOrchestra(message.draft) });
          return;
        case "deleteOrchestra":
          this.service.deleteOrchestra(message.scope, message.slug);
          return;
        case "runOrchestra":
          await this.service.runOrchestra(message.scope, message.slug);
          return;
        default:
          return;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Agent Studio could not complete that action.";
      this.post({ type: "notice", message: text });
      void vscode.window.showErrorMessage(text);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "webview.css"));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "webview.js"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${css}" />
  <title>Agent Studio</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
