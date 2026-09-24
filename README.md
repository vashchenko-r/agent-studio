# Agent Studio

Build, inspect, and orchestrate Cursor subagents without hand-writing frontmatter.

Agent Studio adds a visual workspace to Cursor for creating focused agents, attaching repository context, previewing the exact generated Markdown, and composing multi-agent workflows. The result stays portable: every saved agent is a normal Cursor subagent file that can be reviewed and committed with the rest of your project.

## What you can do

- Create workspace or global subagents from guided forms.
- Start with detailed templates for review, debugging, testing, frontend, backend, API, database, research, planning, accessibility, performance, security, documentation, and verification.
- Attach files, folders, selections, project rules, and configuration as starting context.
- Configure native Cursor fields including `model`, `readonly`, and `is_background`.
- Reopen existing agents from `.cursor/agents`, duplicate them, and inspect the exact compiled prompt.
- Build ordered orchestras that delegate phases to specialist subagents and carry verified handoffs forward.
- Copy an orchestra runbook and open a new Cursor Agent chat.

## Quick start

1. Open **Agent Studio** from the Activity Bar.
2. Select **New** and describe the specialty, or choose a built-in template.
3. Review the role, instructions, responsibilities, constraints, context, and output contract.
4. Select **Save**. Cursor discovers the generated Markdown automatically.

For a reusable workflow, create an **Orchestra**, add agents in execution order, and give each phase a concrete task. The generated coordinator requires every phase to return evidence and verification before handing work to the next phase.

## Files Agent Studio creates

Workspace agents are written to `.cursor/agents/<slug>.md`. Their editable Studio metadata lives at `.cursor/agent-studio/<slug>.json`.

Global agents are written to `~/.cursor/agents/<slug>.md`. Their metadata lives at `~/.cursor/agent-studio/<slug>.json`.

The Markdown file is the source Cursor executes. The JSON sidecar only preserves the structured editor state. Existing Markdown agents appear in Agent Studio even when no sidecar exists; saving an imported file rewrites its prompt into Agent Studio's sectioned format.

## How generation works

Agent Studio is intentionally local and transparent:

- **Generate** uses local keyword matching to select a built-in template. It does not send the prompt to a model.
- Profiles, responsibilities, constraints, context, project rules, behavior, output format, and skills are compiled into the prompt body.
- Native Cursor frontmatter contains `name`, `description`, `model`, `readonly`, and `is_background`.
- **Inspector** shows the exact file before you save it.

## Cursor API limitations

Cursor currently exposes no extension API that submits a subagent run. Saved agents are invoked through Cursor itself with `/agent-name`. For orchestras, Agent Studio can copy the complete runbook and open a new Agent chat when `composer.newAgentChat` is available; you review, paste, and send it yourself.

Subagents inherit the parent agent's tools. Per-agent tool allowlists, MCP servers, hooks, custom environments, and permissions beyond `readonly` are not public subagent fields; the advanced editor labels those limitations instead of pretending to configure them.

The optional `agentStudio.mirrorAgentsToPlugin` setting mirrors saved agents into an extension-managed Cursor plugin directory. It is disabled by default because Cursor already reads workspace and global agent directories, and mirroring may display duplicates.

## Privacy

Agent Studio has no telemetry and makes no network requests. Agent definitions, profiles, templates, and context presets remain on your machine. Selected code is embedded in the generated agent prompt only when you explicitly attach it.

## Requirements

- Cursor with VS Code extension compatibility
- VS Code engine `1.85.0` or newer

This extension targets Cursor-specific subagents. It can load in compatible VS Code builds, but agent discovery and Cursor chat commands require Cursor.

Agent Studio currently targets the first folder in a multi-root workspace. Virtual workspaces are unsupported, and untrusted workspaces must be trusted before the extension can write agent definitions.

## Development

```bash
npm install
npm test
npm run check
npm run compile
npm run package:vsix
```

Launch **Run Agent Studio** from Run and Debug for an Extension Development Host.

## Support

See `SUPPORT.md` for troubleshooting and issue-reporting details. Changes are documented in `CHANGELOG.md`.
