import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CursorAgentStore } from "../../integrations/cursor/CursorAgentStore";
import { draftFromMarkdown } from "./parseAgent";
import { emptyAgentMarkdown } from "./emptyAgent";
import { firstFileWorkspaceRoot } from "../../extension/workspaceRoot";

test("empty agent markdown keeps every field and a hint for it", () => {
  const markdown = emptyAgentMarkdown("empty-agent", "Empty agent");
  const draft = draftFromMarkdown(markdown, "fallback", "workspace", "✦");
  assert.equal(draft.slug, "empty-agent");
  assert.equal(draft.displayName, "Empty agent");
  assert.equal(draft.description, "Describe when to use this agent.");
  assert.equal(draft.model, "inherit");
  assert.equal(draft.readonly, false);
  assert.equal(draft.isBackground, false);
  assert.match(markdown, /# name:/);
  assert.match(markdown, /# description:/);
  assert.match(markdown, /# model:/);
  assert.match(markdown, /# readonly:/);
  assert.match(markdown, /# is_background:/);
  for (const heading of ["Responsibilities", "Constraints", "Context", "Project rules", "Behavior", "Output", "Skills"]) {
    assert.match(markdown, new RegExp(`## ${heading}\\n\\n<!--`));
  }
  assert.match(markdown, /<!-- Role:/);
  assert.match(markdown, /<!-- Instructions:/);
});

test("empty agent creates .cursor/agents in a project that does not have one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-studio-empty-"));
  const store = new CursorAgentStore({
    workspaceRoot: root,
    userAgentsDir: path.join(root, "user-agents"),
    userStudioDir: path.join(root, "user-studio"),
  });
  assert.equal(fs.existsSync(path.join(root, ".cursor")), false);
  const created = store.createEmpty("workspace");
  assert.equal(created.slug, "empty-agent");
  assert.equal(created.displayName, "Empty agent");
  assert.equal(created.imported, true);
  assert.equal(created.nativePath, path.join(root, ".cursor", "agents", "empty-agent.md"));
  assert.equal(fs.existsSync(path.join(root, ".cursor", "agents")), true);
  assert.equal(fs.existsSync(path.join(root, ".cursor", "agent-studio", "empty-agent.json")), false);
  const markdown = fs.readFileSync(created.nativePath, "utf8");
  assert.match(markdown, /name: empty-agent/);
  assert.match(markdown, /<!-- Role:/);
  const again = store.createEmpty("workspace");
  assert.equal(again.slug, "empty-agent-2");
  assert.equal(again.displayName, "Empty agent 2");
  assert.match(fs.readFileSync(created.nativePath, "utf8"), /<!-- Role:/);
  assert.equal(store.list().some((agent) => agent.slug === "empty-agent"), true);
});

test("empty agent in global scope is written under the user agents directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-studio-empty-global-"));
  const userAgentsDir = path.join(root, "user-agents");
  const store = new CursorAgentStore({
    workspaceRoot: root,
    userAgentsDir,
    userStudioDir: path.join(root, "user-studio"),
  });
  const created = store.createEmpty("global");
  assert.equal(created.slug, "global-empty-agent");
  assert.equal(created.displayName, "Global Empty agent");
  assert.equal(created.nativePath, path.join(userAgentsDir, "global-empty-agent.md"));
  assert.equal(fs.existsSync(path.join(root, ".cursor")), false);
});

test("empty agent requires a project folder for workspace scope", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-studio-empty-missing-"));
  const store = new CursorAgentStore({
    userAgentsDir: path.join(root, "user-agents"),
    userStudioDir: path.join(root, "user-studio"),
  });
  assert.throws(() => store.createEmpty("workspace"), /workspace folder/);
});

test("a file folder opened after an empty window is the project root", () => {
  assert.equal(firstFileWorkspaceRoot(undefined), undefined);
  assert.equal(firstFileWorkspaceRoot([]), undefined);
  assert.equal(
    firstFileWorkspaceRoot([
      { uri: { scheme: "untitled", fsPath: "/untitled" } },
      { uri: { scheme: "file", fsPath: "/work/empty-project" } },
    ]),
    "/work/empty-project",
  );
});
