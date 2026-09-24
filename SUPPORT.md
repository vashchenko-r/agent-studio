# Agent Studio support

## Before reporting a problem

1. Confirm you are running Cursor with VS Code extension compatibility.
2. Run **Developer: Reload Window** after installing or updating Agent Studio.
3. Check that workspace agents exist in `.cursor/agents` or global agents in `~/.cursor/agents`.
4. Open **Developer: Toggle Developer Tools** and include relevant errors from the Console.

## Useful details for a report

- Agent Studio version
- Cursor version and operating system
- Whether the agent is workspace or global
- Minimal reproduction steps
- The generated Markdown with private paths and instructions removed
- Expected and actual behavior

Do not include secrets, proprietary selected code, access tokens, or private agent instructions in a public report.

## Known platform limitation

Cursor does not expose a public extension API for submitting a subagent run. Agent Studio copies the invocation or orchestra runbook, opens Agent chat when possible, and leaves the final paste/send action to you.

