# Changelog

All notable changes to Agent Studio are documented here.

## 0.1.14

- Showed how to create an empty agent, start from a template, and delete an agent in the listing.
- Added a Boosty sponsor link.

## 0.1.13

- Saving an agent or an orchestra opens its Markdown file in the editor, including a global file under `~/.cursor/agents`.

## 0.1.12

- Added Empty agent. It creates `.cursor/agents` in the open project and writes a blank subagent file with a comment on each field.
- A project folder opened after Agent Studio starts is picked up, so new workspace agents are saved in that project's `.cursor/agents`.

## 0.1.11

- Confirmed Delete inside the Agent Studio panel, because the sidebar cannot show a browser confirm dialog.
- Removed the agent file when its filename and frontmatter name differ, including prefixed global agents.

## 0.1.10

- Prefixed global agent slugs with `global-` and renamed existing global agents so short names stay available in a project.
- Rewrote built-in templates with explicit delegation triggers and a short "When invoked" procedure.

## 0.1.9

- Refused to save a second agent with a slug that already exists in the other scope, because Cursor calls agents by `/slug`.
- Hid ambiguous and background agents from orchestra steps and explained how to make them available.
- Left background mode off for new agents and showed the Background control in the main editor.

## 0.1.8

- Rewrote the Marketplace README into a shorter guide with direct links to the repository, issues, and discussions.

## 0.1.7

- Removed misleading per-agent run controls; saved agents are invoked through Cursor's native `/agent-name` flow.

## 0.1.6

- Hid Cursor run controls until the agent has been saved and is available for invocation.

## 0.1.5

- Hardened agent and orchestra file operations against unsafe paths and symbolic-link overwrites.
- Added coordinator ownership markers and excluded generated coordinators from the regular agent editor.
- Added validated sequential dependencies, stale-dependency checks, scope ambiguity checks, and readonly coordinator inference.
- Distinguished orchestra creation from updates and made persisted orchestra scope immutable.
- Added atomic file writes and protected selected-code fences from prompt injection.
- Expanded the built-in template catalog and improved template routing.

## 0.1.4

- Added visual creation and editing for workspace and global Cursor subagents.
- Added detailed built-in templates and reusable specialist profiles.
- Added context attachment, effective prompt inspection, and local template matching.
- Added ordered multi-agent orchestras with explicit delegation and verified handoffs.
- Added commands for creating, searching, duplicating, editing, and previewing agents.
- Added Marketplace metadata, release packaging, and product documentation.

