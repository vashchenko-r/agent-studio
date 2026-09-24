export type AgentScope = "workspace" | "global";

export type ContextKind = "file" | "folder" | "workspace" | "selection" | "rule" | "config";

export interface ContextItem {
  id: string;
  kind: ContextKind;
  path: string;
  label: string;
  snippet?: string;
}

export interface AgentDraft {
  slug: string;
  scope: AgentScope;
  icon: string;
  displayName: string;
  description: string;
  role: string;
  instructions: string;
  responsibilities: string[];
  constraints: string[];
  context: ContextItem[];
  profileId?: string;
  readonly: boolean;
  isBackground: boolean;
  model: string;
  outputFormat: string;
  behavior: string;
  projectRules: string;
  skills: string;
  /** Stored for the inspector. Not a native per-agent field. */
  mcpNote: string;
  hooksNote: string;
  environmentNote: string;
}

export interface AgentRecord extends AgentDraft {
  createdAt: string;
  updatedAt: string;
  /** Absolute path of the Cursor subagent markdown file. */
  nativePath: string;
  /** True when the record was synthesized from an existing markdown file. */
  imported: boolean;
}

export interface Profile {
  id: string;
  name: string;
  summary: string;
  expertise: string[];
  principles: string[];
  communication: string[];
  builtin: boolean;
}

export interface AgentTemplate {
  id: string;
  name: string;
  icon: string;
  summary: string;
  keywords: string[];
  profileId?: string;
  draft: Omit<AgentDraft, "slug" | "scope" | "context">;
  builtin: boolean;
}

export interface ContextPreset {
  id: string;
  name: string;
  context: ContextItem[];
}

export interface OrchestraStep {
  scope: AgentScope;
  slug: string;
  task: string;
}

export interface OrchestraDraft {
  slug: string;
  scope: AgentScope;
  /** Original identity is present only when updating an existing orchestra. */
  originalSlug?: string;
  originalScope?: AgentScope;
  displayName: string;
  description: string;
  steps: OrchestraStep[];
}

export interface OrchestraRecord extends OrchestraDraft {
  createdAt: string;
  updatedAt: string;
  /** Absolute path of the compiled runbook. Cursor does not execute this file. */
  nativePath: string;
}

export interface CapabilityReport {
  subagentFileFormat: true;
  pluginPathRegistration: boolean;
  pluginPathRegistrationDetail: string;
  mcpRegistration: boolean;
  mcpRegistrationDetail: string;
  directLaunch: false;
  launchDetail: string;
  nativeFrontmatter: Array<"name" | "description" | "model" | "readonly" | "is_background">;
  compiledIntoPrompt: string[];
  unsupportedPerAgent: Array<{
    id: string;
    label: string;
    reason: string;
  }>;
}

export interface EffectiveConfiguration {
  nativePath: string;
  scope: AgentScope;
  frontmatter: Record<string, string | boolean>;
  prompt: string;
  markdown: string;
  profileName?: string;
  context: ContextItem[];
  unsupported: CapabilityReport["unsupportedPerAgent"];
}
