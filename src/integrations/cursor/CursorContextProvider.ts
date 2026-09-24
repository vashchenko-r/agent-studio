import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { ContextItem } from "../../domain/types";
import { createId } from "../../domain/ids";

const CONFIG_CANDIDATES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "AGENTS.md",
];

export class CursorContextProvider {
  workspaceItem(): ContextItem | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return {
      id: createId("ctx"),
      kind: "workspace",
      path: folder.uri.fsPath,
      label: folder.name,
    };
  }

  selectionItem(): ContextItem | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return undefined;
    }
    const relative = vscode.workspace.asRelativePath(editor.document.uri);
    const start = editor.selection.start.line + 1;
    const end = editor.selection.end.line + 1;
    return {
      id: createId("ctx"),
      kind: "selection",
      path: `${relative}:${start}-${end}`,
      label: `${path.basename(relative)}:${start}-${end}`,
      snippet: editor.document.getText(editor.selection).slice(0, 4000),
    };
  }

  projectRules(): ContextItem[] {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    const rulesDir = path.join(folder.uri.fsPath, ".cursor", "rules");
    if (!fs.existsSync(rulesDir)) {
      return [];
    }
    return fs
      .readdirSync(rulesDir)
      .filter((file) => /\.(mdc|md|markdown)$/.test(file))
      .map((file) => ({
        id: createId("ctx"),
        kind: "rule" as const,
        path: `.cursor/rules/${file}`,
        label: file,
      }));
  }

  configurationFiles(): ContextItem[] {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    return CONFIG_CANDIDATES.filter((file) => fs.existsSync(path.join(folder.uri.fsPath, file))).map((file) => ({
      id: createId("ctx"),
      kind: "config" as const,
      path: file,
      label: file,
    }));
  }

  async pick(kind: "file" | "folder"): Promise<ContextItem[]> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: kind === "file",
      canSelectFolders: kind === "folder",
      canSelectMany: true,
      openLabel: kind === "file" ? "Add files" : "Add folders",
    });
    if (!uris) {
      return [];
    }
    return uris.map((uri) => {
      const relative = vscode.workspace.asRelativePath(uri);
      return {
        id: createId("ctx"),
        kind,
        path: relative,
        label: path.basename(uri.fsPath),
      };
    });
  }
}
