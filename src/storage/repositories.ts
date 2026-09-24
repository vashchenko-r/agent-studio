import * as fs from "fs";
import * as path from "path";
import type { ContextPreset, Profile } from "../domain/types";
import { builtinProfiles } from "../domain/profiles/builtinProfiles";
import { builtinTemplates } from "../domain/templates/builtinTemplates";
import type { AgentTemplate } from "../domain/types";
import { createId, slugify } from "../domain/ids";

function readArray<T>(file: string): T[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(file: string, value: unknown[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class ProfileRepository {
  constructor(private readonly file: string) {}

  list(): Profile[] {
    const custom = readArray<Profile>(this.file).map((profile) => ({ ...profile, builtin: false }));
    const customIds = new Set(custom.map((profile) => profile.id));
    return [...builtinProfiles.filter((profile) => !customIds.has(profile.id)), ...custom];
  }

  save(input: Omit<Profile, "builtin" | "id"> & { id?: string }): Profile {
    const custom = readArray<Profile>(this.file);
    const id = input.id && !builtinProfiles.some((profile) => profile.id === input.id) ? input.id : slugify(input.name);
    const next: Profile = { ...input, id, builtin: false };
    const index = custom.findIndex((profile) => profile.id === id);
    if (index >= 0) {
      custom[index] = next;
    } else {
      custom.push(next);
    }
    writeArray(this.file, custom);
    return next;
  }

  delete(id: string): void {
    if (builtinProfiles.some((profile) => profile.id === id)) {
      throw new Error("Built-in profiles stay in the extension. Duplicate one under a new name to change it.");
    }
    writeArray(
      this.file,
      readArray<Profile>(this.file).filter((profile) => profile.id !== id),
    );
  }
}

export class TemplateRepository {
  constructor(private readonly file: string) {}

  list(): AgentTemplate[] {
    const custom = readArray<AgentTemplate>(this.file).map((template) => ({ ...template, builtin: false }));
    return [...builtinTemplates, ...custom];
  }

  save(template: AgentTemplate): AgentTemplate {
    const custom = readArray<AgentTemplate>(this.file).filter((item) => item.id !== template.id);
    const next = { ...template, builtin: false, id: template.id || slugify(template.name) };
    custom.push(next);
    writeArray(this.file, custom);
    return next;
  }
}

export class PresetRepository {
  constructor(private readonly file: string | undefined) {}

  list(): ContextPreset[] {
    if (!this.file) {
      return [];
    }
    return readArray<ContextPreset>(this.file);
  }

  save(name: string, context: ContextPreset["context"]): ContextPreset {
    if (!this.file) {
      throw new Error("Open a workspace folder before saving a context preset.");
    }
    const presets = this.list();
    const preset: ContextPreset = { id: createId("preset"), name, context };
    presets.push(preset);
    writeArray(this.file, presets);
    return preset;
  }

  delete(id: string): void {
    if (!this.file) {
      return;
    }
    writeArray(
      this.file,
      this.list().filter((preset) => preset.id !== id),
    );
  }
}
