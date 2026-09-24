import type { CapabilityReport } from "../../domain/types";

const unsupported: CapabilityReport["unsupportedPerAgent"] = [
  {
    id: "tools",
    label: "Per-tool allow list",
    reason: "A subagent inherits the parent agent's tools. The public file format only has readonly, which blocks edits and state-changing shell commands.",
  },
  {
    id: "mcp",
    label: "Per-agent MCP servers",
    reason: "vscode.cursor.mcp.registerServer registers a server for the Cursor session. Subagents inherit the parent session's MCP tools. There is no per-subagent MCP field.",
  },
  {
    id: "hooks",
    label: "Per-agent hooks",
    reason: "Hooks live in hooks.json at the project, user, or plugin level and apply to the agent loop, not to one subagent file.",
  },
  {
    id: "environment",
    label: "Per-agent environment",
    reason: "Subagent markdown has no environment block. Cloud environments are configured for the repository, not for one local subagent file.",
  },
  {
    id: "permissions",
    label: "Permissions beyond readonly",
    reason: "readonly and is_background are the only permission-related frontmatter fields in the public subagent format.",
  },
  {
    id: "launch",
    label: "Direct run",
    reason: "The public extension API can register plugin paths and MCP servers. It cannot start a subagent run. Invoke the saved agent with /name in Agent chat.",
  },
];

export function capabilityReport(input: {
  pluginPathRegistration: boolean;
  pluginPathDetail: string;
  mcpRegistration: boolean;
}): CapabilityReport {
  return {
    subagentFileFormat: true,
    pluginPathRegistration: input.pluginPathRegistration,
    pluginPathRegistrationDetail: input.pluginPathDetail,
    mcpRegistration: input.mcpRegistration,
    mcpRegistrationDetail: input.mcpRegistration
      ? "vscode.cursor.mcp.registerServer is present. Agent Studio does not call it, because a registered server would apply to the whole session rather than one agent."
      : "vscode.cursor.mcp.registerServer was not found on this Cursor build.",
    directLaunch: false,
    launchDetail:
      "No public extension command accepts a subagent id and runs it. Agent Studio copies /slug and opens a new Agent chat when composer.newAgentChat exists. You submit the prompt yourself.",
    nativeFrontmatter: ["name", "description", "model", "readonly", "is_background"],
    compiledIntoPrompt: [
      "role",
      "instructions",
      "profile",
      "responsibilities",
      "constraints",
      "context",
      "project rules",
      "behavior",
      "output format",
      "skills",
    ],
    unsupportedPerAgent: unsupported,
  };
}
