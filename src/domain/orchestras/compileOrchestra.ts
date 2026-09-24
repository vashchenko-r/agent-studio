import type { AgentRecord, OrchestraDraft } from "../types";

export function validateOrchestra(draft: OrchestraDraft, agents: AgentRecord[]): string[] {
  const errors: string[] = [];
  for (const step of draft.steps.filter((item) => item.slug)) {
    const exact = agents.find((agent) => agent.scope === step.scope && agent.slug === step.slug);
    if (!exact) {
      errors.push(`Agent ${step.scope}/${step.slug} no longer exists.`);
      continue;
    }
    if (draft.scope === "global" && step.scope === "workspace") {
      errors.push(`Global orchestras cannot depend on workspace agent ${step.slug}.`);
    }
    if (step.scope === draft.scope && step.slug === draft.slug) {
      errors.push(`Orchestra ${draft.slug} cannot delegate to itself.`);
    }
    if (agents.filter((agent) => agent.slug === step.slug).length > 1) {
      errors.push(`Agent slug ${step.slug} exists in both workspace and global scope and is ambiguous to Cursor.`);
    }
    if (exact.isBackground) {
      errors.push(`Background agent ${step.slug} cannot be used in a strictly sequential orchestra.`);
    }
  }
  return [...new Set(errors)];
}

export function compileOrchestra(draft: OrchestraDraft, agents: AgentRecord[]): string {
  const steps = draft.steps.map((step, index) => {
    const agent = agents.find((item) => item.scope === step.scope && item.slug === step.slug);
    const name = agent?.displayName ?? step.slug;
    const task = step.task.trim() || "Complete this phase using the original request and the prior phase handoff.";
    return [
      `### ${index + 1}. ${name} (\`/${step.slug}\`, ${step.scope})`,
      "",
      `Delegate this phase to the \`${step.slug}\` subagent.`,
      "",
      `Task: ${task}`,
      "",
      index === 0
        ? "Input: the user's original request and relevant repository context."
        : "Input: the user's original request plus the verified result and unresolved issues from every earlier phase.",
      "",
      "Required return: findings or changes, concrete evidence, verification performed, and blockers or follow-up needed.",
    ].join("\n");
  });
  const lines = [
    `# ${draft.displayName.trim() || draft.slug}`,
    "",
    draft.description.trim(),
    "",
    "## Orchestration contract",
    "",
    "Coordinate the phases below with Cursor's subagent delegation tool. The `/name` labels identify the exact custom subagents; do not merely role-play them in the parent context.",
    "Run phases strictly in order. Before starting the next phase, wait for the current phase and check that it returned its required evidence.",
    "Pass forward a concise handoff containing decisions, changed files, verification results, and unresolved risks. Never claim a phase ran when delegation failed.",
    "If a subagent is unavailable, stop that dependency chain and report the missing agent instead of silently replacing it.",
    "After the final phase, reconcile conflicting findings and return one completion summary with what changed, checks run, remaining risks, and recommended next action.",
    "",
    "## Phases",
    "",
    ...steps,
    "",
  ];
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function compileOrchestraAgent(draft: OrchestraDraft, agents: AgentRecord[]): string {
  const description = JSON.stringify(
    (draft.description.trim() || `Coordinate the ${draft.displayName} workflow.`).replace(/\s+/g, " "),
  );
  const dependencies = draft.steps
    .map((step) => agents.find((agent) => agent.scope === step.scope && agent.slug === step.slug))
    .filter((agent): agent is AgentRecord => Boolean(agent));
  const readonly = dependencies.length === draft.steps.length && dependencies.every((agent) => agent.readonly);
  return [
    "---",
    `name: ${draft.slug}`,
    `description: ${description}`,
    "model: inherit",
    `readonly: ${readonly ? "true" : "false"}`,
    "is_background: false",
    "---",
    "",
    `<!-- agent-studio:orchestra:${draft.slug} -->`,
    "",
    compileOrchestra(draft, agents),
  ].join("\n");
}
