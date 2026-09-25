const vscode = acquireVsCodeApi();

const state = {
  screen: "list",
  snapshot: null,
  query: "",
  draft: null,
  mode: "simple",
  notice: "",
  preview: null,
  createPrompt: "",
  createScope: "workspace",
  createContext: [],
  orchestra: null,
  profileForm: emptyProfileForm(),
};

const app = document.getElementById("app");

function post(message) {
  vscode.postMessage(message);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptyProfileForm() {
  return { id: "", name: "", summary: "", expertise: "", principles: "", communication: "" };
}

function lines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function ambiguousSlugs(agents) {
  const counts = new Map();
  for (const agent of agents) {
    counts.set(agent.slug, (counts.get(agent.slug) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([slug]) => slug));
}

function field(label, html, badge) {
  return `<label class="field"><span>${escapeHtml(label)}${badge ? `<i class="badge">${escapeHtml(badge)}</i>` : ""}</span>${html}</label>`;
}

function renderList() {
  const snapshot = state.snapshot;
  const query = state.query.trim().toLowerCase();
  const agents = (snapshot?.agents || []).filter((agent) => {
    const haystack = `${agent.displayName} ${agent.description} ${agent.role}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  const colliding = ambiguousSlugs(snapshot?.agents || []);
  const groups = [
    ["workspace", "Project agents"],
    ["global", "Global agents"],
  ];
  const body = groups
    .map(([scope, label]) => {
      const items = agents.filter((agent) => agent.scope === scope);
      if (items.length === 0) {
        return "";
      }
      return `<div class="section-label">${label}</div>${items
        .map(
          (agent) => `<button class="agent" data-action="edit" data-scope="${agent.scope}" data-slug="${escapeHtml(agent.slug)}">
            <strong>${escapeHtml(agent.displayName)}</strong>
            <span class="meta">${escapeHtml(agent.description || agent.role || agent.slug)}</span>
            ${colliding.has(agent.slug) ? `<span class="meta">/${escapeHtml(agent.slug)} is also saved in the other scope. Cursor cannot tell the two apart.</span>` : ""}
          </button>`,
        )
        .join("")}`;
    })
    .join("");
  return `<div class="screen">
    <header class="header">
      <div class="header-copy"><h1>AGENT STUDIO</h1><p class="tagline">Build and manage your Cursor agents visually.</p></div>
      <button class="primary header-action" data-action="new">New</button>
    </header>
    <div class="search"><input id="search" placeholder="Search agents..." value="${escapeHtml(state.query)}" /></div>
    ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
    ${body || `<div class="empty">No agents yet. Create one, or add a markdown file to .cursor/agents.</div>`}
    <div class="section-label">Orchestras</div>
    <div class="group">
      ${(snapshot?.orchestras || [])
        .map(
          (orchestra) => `<div class="template"><div><strong>${escapeHtml(orchestra.displayName)}</strong><div class="meta">${orchestra.steps.length} agents · ${escapeHtml(orchestra.scope)}</div></div><button data-action="edit-orchestra" data-scope="${orchestra.scope}" data-slug="${escapeHtml(orchestra.slug)}">Edit</button></div>`,
        )
        .join("")}
      <div class="actions"><button data-action="new-orchestra">New orchestra</button></div>
    </div>
    <div class="section-label">Templates</div>
    <div class="group">${(snapshot?.templates || [])
      .map(
        (template) => `<div class="template"><div><strong>${escapeHtml(template.name)}</strong><div class="meta">${escapeHtml(template.summary)}</div></div><button data-action="template" data-id="${escapeHtml(template.id)}">Use</button></div>`,
      )
      .join("")}</div>
  </div>`;
}

function contextList(items) {
  if (!items.length) {
    return `<div class="meta">No context yet.</div>`;
  }
  return items
    .map(
      (item, index) => `<div class="context-item">
        <div><strong>${item.kind === "folder" ? "DIR" : item.kind === "file" || item.kind === "config" || item.kind === "rule" ? "FILE" : item.kind.toUpperCase()}</strong> <code>${escapeHtml(item.label)}</code><div class="meta">${escapeHtml(item.path)}</div></div>
        <span class="row">
          <button data-action="ctx-up" data-index="${index}" aria-label="Move context up">↑</button>
          <button data-action="ctx-down" data-index="${index}" aria-label="Move context down">↓</button>
          <button data-action="ctx-remove" data-index="${index}" aria-label="Remove context">✕</button>
        </span>
      </div>`,
    )
    .join("");
}

function renderEditor() {
  const draft = state.draft;
  const advanced = state.mode === "advanced";
  const profiles = state.snapshot?.profiles || [];
  const unsupported = state.snapshot?.capabilities?.unsupportedPerAgent || [];
  return `<div class="screen">
    <header class="header balanced">
      <button class="start" data-action="back">Agents</button>
      <strong class="title">${escapeHtml(draft.displayName || "New agent")}</strong>
      <button class="end primary" data-action="save">Save</button>
    </header>
    <div class="body">
      ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
      <div class="segment">
        <button data-action="mode" data-mode="simple" class="${advanced ? "" : "primary"}">Simple</button>
        <button data-action="mode" data-mode="advanced" class="${advanced ? "primary" : ""}">Advanced</button>
      </div>
      ${field("Name", `<input id="displayName" value="${escapeHtml(draft.displayName)}" />`)}
      ${field("Description", `<textarea id="description">${escapeHtml(draft.description)}</textarea>`, "native")}
      ${field("Role", `<textarea id="role">${escapeHtml(draft.role)}</textarea>`, "prompt")}
      ${field("Instructions", `<textarea id="instructions">${escapeHtml(draft.instructions)}</textarea>`, "prompt")}
      <div class="label">Context <i class="badge">compiled into prompt</i></div>
      ${contextList(draft.context)}
      <div class="actions cols-3">
        <button data-action="pick" data-kind="file">Add files</button>
        <button data-action="pick" data-kind="folder">Add folder</button>
        <button data-action="pick" data-kind="workspace">Workspace</button>
        <button data-action="pick" data-kind="rules">Rules</button>
        <button data-action="pick" data-kind="config">Config</button>
      </div>
      <div class="label">Tools</div>
      <label class="check"><input id="readonly" type="checkbox" ${draft.readonly ? "checked" : ""} /> <span>Read-only <i class="badge">native readonly</i></span></label>
      <p class="meta">Subagents inherit the parent agent's tools. A per-tool allow list is not a public subagent field.</p>
      <label class="check"><input id="isBackground" type="checkbox" ${draft.isBackground ? "checked" : ""} /> <span>Background <i class="badge">native is_background</i></span></label>
      <p class="meta">A background agent does not block the chat. An orchestra cannot use it, because the next phase waits for a result.</p>
      <div class="stack${advanced ? "" : " hidden"}">
        ${field("Scope", `<select id="scope"><option value="workspace" ${draft.scope === "workspace" ? "selected" : ""}>Workspace .cursor/agents</option><option value="global" ${draft.scope === "global" ? "selected" : ""}>Global ~/.cursor/agents</option></select>`)}
        ${field("Profile", `<select id="profileId"><option value="">None</option>${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.profileId === profile.id ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("")}</select>`, "compiled")}
        ${field("Responsibilities", `<textarea id="responsibilities">${escapeHtml(draft.responsibilities.join("\n"))}</textarea>`, "prompt")}
        ${field("Constraints", `<textarea id="constraints">${escapeHtml(draft.constraints.join("\n"))}</textarea>`, "prompt")}
        ${field("Model", `<input id="model" value="${escapeHtml(draft.model)}" placeholder="inherit" />`, "native")}
        <p class="meta">Documented values: inherit, or a model id such as composer-2.5. Optional parameters use model[id=value]. Agent Studio does not query a live model catalog.</p>
        ${field("Output format", `<textarea id="outputFormat">${escapeHtml(draft.outputFormat)}</textarea>`, "prompt")}
        ${field("Behavior", `<textarea id="behavior">${escapeHtml(draft.behavior)}</textarea>`, "prompt")}
        ${field("Project rules", `<textarea id="projectRules">${escapeHtml(draft.projectRules)}</textarea>`, "prompt")}
        ${field("Skills", `<textarea id="skills">${escapeHtml(draft.skills)}</textarea>`, "prompt")}
        ${unsupported
          .filter((item) => item.id !== "launch")
          .map((item) => `<div class="limit"><strong>${escapeHtml(item.label)}</strong> — unsupported per agent. ${escapeHtml(item.reason)}</div>`)
          .join("")}
        <div class="section-label">Profiles</div>
        <p class="meta">A profile is a reusable specialty you attach to an agent. The three built-in ones are examples. Create your own for a backend engineer, tester, analyst, or any other role.</p>
        ${profiles
          .map(
            (profile) => `<div class="profile"><div><strong>${escapeHtml(profile.name)}</strong><div class="meta">${escapeHtml(profile.expertise.join(", "))}</div></div><div class="row"><button data-action="edit-profile" data-id="${escapeHtml(profile.id)}">${profile.builtin ? "Copy" : "Edit"}</button>${profile.builtin ? "" : `<button data-action="delete-profile" data-id="${escapeHtml(profile.id)}">Delete</button>`}</div></div>`,
          )
          .join("")}
        ${field("Profile name", `<input id="profileName" value="${escapeHtml(state.profileForm.name)}" placeholder="Backend engineer" />`)}
        ${field("Summary", `<textarea id="profileSummary">${escapeHtml(state.profileForm.summary)}</textarea>`)}
        ${field("Expertise", `<textarea id="profileExpertise" placeholder="One item per line">${escapeHtml(state.profileForm.expertise)}</textarea>`)}
        ${field("Principles", `<textarea id="profilePrinciples" placeholder="One item per line">${escapeHtml(state.profileForm.principles)}</textarea>`)}
        ${field("Communication", `<textarea id="profileCommunication" placeholder="One item per line">${escapeHtml(state.profileForm.communication)}</textarea>`)}
        <div class="actions cols-2"><button data-action="save-profile">${state.profileForm.id ? "Save profile" : "Create profile"}</button><button data-action="save-preset">Save context</button></div>
      </div>
      <div class="actions cols-3">
        <button data-action="inspect">Inspect</button>
        <button data-action="duplicate" ${draft.slug ? "" : "disabled"}>Duplicate</button>
        <button data-action="remove" ${draft.slug ? "" : "disabled"}>Delete</button>
      </div>
    </div>
  </div>`;
}

function renderCreate() {
  const templates = state.snapshot?.templates || [];
  return `<div class="screen">
    <header class="header balanced"><button class="start" data-action="back">Agents</button><h1 class="title">New agent</h1><span class="end"></span></header>
    <div class="body">
      ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
      <label class="field"><span>What should this agent specialize in?</span>
        <textarea id="createPrompt" placeholder="Create a senior React expert that follows our design system, checks accessibility and performance, and never modifies backend code.">${escapeHtml(state.createPrompt)}</textarea>
      </label>
      ${field("Save to", `<select id="createScope"><option value="workspace">Workspace</option><option value="global" ${state.createScope === "global" ? "selected" : ""}>Global</option></select>`)}
      ${state.createContext.length ? `<div class="label">Initial context</div>${contextList(state.createContext)}` : ""}
      <div class="actions"><button class="primary" data-action="generate">Generate</button></div>
      <p class="meta">Generate fills a reviewable configuration locally. It does not call a model. Saving writes a real Cursor subagent file.</p>
      <div class="section-label">Or start from a template</div>
      ${templates
        .map(
          (template) => `<div class="template"><div><strong>${escapeHtml(template.name)}</strong><div class="meta">${escapeHtml(template.summary)}</div></div><button data-action="template" data-id="${escapeHtml(template.id)}">Use</button></div>`,
        )
        .join("")}
    </div>
  </div>`;
}

function renderInspector() {
  const draft = state.draft;
  const preview = state.preview;
  const capabilities = state.snapshot?.capabilities;
  const profile = (state.snapshot?.profiles || []).find((item) => item.id === draft.profileId);
  return `<div class="screen">
    <header class="header balanced"><button class="start" data-action="back-editor">Editor</button><strong class="title">Inspector</strong><button class="end" data-action="refresh-preview">Refresh</button></header>
    <div class="body">
      <div class="pipe">
        <p class="step"><strong>PROFILE</strong><br>${escapeHtml(profile ? profile.name : "None")}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>INSTRUCTIONS</strong><br>${escapeHtml(draft.instructions || draft.role)}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>PROJECT RULES</strong><br>${escapeHtml(draft.projectRules || "None in this agent. Workspace rules still apply separately.")}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>CONTEXT</strong><br>${draft.context.length ? draft.context.map((item) => escapeHtml(item.path)).join("<br>") : "None"}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>TOOLS</strong><br>${draft.readonly ? "readonly: true" : "Inherits parent tools. readonly: false"}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>MODEL</strong><br>${escapeHtml(draft.model || "inherit")}</p>
        <div class="arrow">↓</div>
        <p class="step"><strong>OUTPUT</strong><br>${escapeHtml(draft.outputFormat || "No output section")}</p>
      </div>
      <div class="label">Native file</div>
      <p class="mono">${escapeHtml(preview?.nativePath || "Save the agent to write the file.")}</p>
      <div class="label">Preview effective configuration</div>
      <pre>${escapeHtml(preview?.markdown || "Open preview to compile the file.")}</pre>
      <div class="limit">${escapeHtml(capabilities?.launchDetail || "")}</div>
      <div class="limit">${escapeHtml(capabilities?.pluginPathRegistrationDetail || "")}</div>
      <div class="actions"><button data-action="back-editor">Edit</button></div>
    </div>
  </div>`;
}

function blankOrchestra() {
  return {
    slug: "",
    scope: state.snapshot?.hasWorkspace ? "workspace" : "global",
    displayName: "",
    description: "",
    steps: [],
    persistedSlug: false,
  };
}

function renderOrchestra() {
  const orchestra = state.orchestra;
  const agents = state.snapshot?.agents || [];
  const colliding = ambiguousSlugs(agents);
  const selectable = agents.filter((agent) => !colliding.has(agent.slug) && !agent.isBackground);
  const options = selectable
    .map((agent) => `<option value="${agent.scope}:${agent.slug}">${escapeHtml(agent.displayName)} · ${agent.scope} · /${escapeHtml(agent.slug)}</option>`)
    .join("");
  const collisionNote = colliding.size
    ? `<p class="meta">These slugs exist in both project and global scope, so they are hidden here: ${[...colliding].map((slug) => `/${escapeHtml(slug)}`).join(", ")}. Delete one copy, then add the agent again.</p>`
    : "";
  const backgroundNote = agents.some((agent) => agent.isBackground)
    ? `<p class="meta">Background agents are hidden here. An orchestra waits for each phase, and a background agent does not return a result. Turn off Background on the agent to use it.</p>`
    : "";
  const steps = orchestra.steps
    .map((step, index) => {
      const match = agents.find((agent) => agent.scope === step.scope && agent.slug === step.slug);
      const blocked = step.slug && colliding.has(step.slug);
      const backgroundStep = Boolean(match?.isBackground) && !blocked;
      const selected = `${step.scope}:${step.slug}`;
      const picker = blocked
        ? `<p class="meta">/${escapeHtml(step.slug)} exists as both a project and a global agent. Remove this step, or delete one copy and pick the agent again.</p>`
        : backgroundStep
          ? `<p class="meta">/${escapeHtml(step.slug)} runs in the background, so it cannot hand a result to the next phase. Open the agent, turn off Background, and pick it again.</p>`
          : `<select data-step-agent="${index}">
            <option value="">Choose an agent</option>
            ${selectable.map((agent) => `<option value="${agent.scope}:${agent.slug}" ${selected === `${agent.scope}:${agent.slug}` ? "selected" : ""}>${escapeHtml(agent.displayName)} · ${agent.scope} · /${escapeHtml(agent.slug)}</option>`).join("")}
          </select>`;
      return `<div class="template">
        <div>
          ${picker}
          <input data-step-task="${index}" value="${escapeHtml(step.task)}" placeholder="What this step should do" />
        </div>
        <span class="row">
          <button data-action="step-up" data-index="${index}" aria-label="Move phase up">↑</button>
          <button data-action="step-down" data-index="${index}" aria-label="Move phase down">↓</button>
          <button data-action="step-remove" data-index="${index}" aria-label="Remove phase">✕</button>
        </span>
      </div>`;
    })
    .join("");
  return `<div class="screen">
    <header class="header balanced">
      <button class="start" data-action="back">Agents</button>
      <strong class="title">${escapeHtml(orchestra.displayName || "Orchestra")}</strong>
      <button class="end primary" data-action="save-orchestra">Save</button>
    </header>
    <div class="body">
      ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
      <p class="meta">Saving writes one Cursor coordinator subagent. It delegates each phase through Cursor's subagent tool, verifies the handoff, and returns one reconciled result.</p>
      ${field("Name", `<input id="orchestraName" value="${escapeHtml(orchestra.displayName)}" />`)}
      ${field("Description", `<textarea id="orchestraDescription" rows="2">${escapeHtml(orchestra.description)}</textarea>`)}
      ${field("Save to", `<select id="orchestraScope" ${orchestra.persistedSlug ? "disabled" : ""}><option value="workspace" ${orchestra.scope === "workspace" ? "selected" : ""}>Workspace</option><option value="global" ${orchestra.scope === "global" ? "selected" : ""}>Global</option></select>`)}
      <div class="label">Steps</div>
      ${collisionNote}
      ${backgroundNote}
      ${steps || `<p class="meta">No agents in this orchestra yet.</p>`}
      <div class="actions cols-2"><button data-action="add-step" ${options ? "" : "disabled"}>Add agent</button></div>
      <div class="actions cols-2">
        <button class="primary" data-action="run-orchestra" ${orchestra.persistedSlug ? "" : "disabled"}>Run orchestra</button>
        <button data-action="delete-orchestra" ${orchestra.persistedSlug ? "" : "disabled"}>Delete</button>
      </div>
    </div>
  </div>`;
}

function readOrchestraFromDom() {
  const orchestra = state.orchestra;
  if (!orchestra || !document.getElementById("orchestraName")) {
    return;
  }
  orchestra.displayName = document.getElementById("orchestraName").value;
  orchestra.description = document.getElementById("orchestraDescription").value;
  orchestra.scope = document.getElementById("orchestraScope").value;
  orchestra.steps = orchestra.steps.map((step, index) => {
    const select = document.querySelector(`[data-step-agent="${index}"]`);
    const task = document.querySelector(`[data-step-task="${index}"]`)?.value || "";
    if (!select) {
      return { ...step, task };
    }
    const [scope, slug] = (select.value || "").split(":");
    return {
      scope: scope || step.scope,
      slug: slug || "",
      task,
    };
  });
  if (!orchestra.persistedSlug && orchestra.displayName) {
    orchestra.slug = orchestra.displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "orchestra";
  }
}

function render() {
  const previousSearch = document.activeElement && document.activeElement.id === "search";
  const selectionStart = previousSearch ? document.activeElement.selectionStart : 0;
  if (state.screen === "create") {
    app.innerHTML = renderCreate();
  } else if (state.screen === "orchestra") {
    app.innerHTML = renderOrchestra();
  } else if (state.screen === "editor") {
    app.innerHTML = renderEditor();
  } else if (state.screen === "inspector") {
    app.innerHTML = renderInspector();
  } else {
    app.innerHTML = renderList();
  }
  if (previousSearch) {
    const search = document.getElementById("search");
    if (search) {
      search.focus();
      search.setSelectionRange(selectionStart, selectionStart);
    }
  }
}

function readDraftFromDom() {
  const draft = state.draft;
  if (!draft) {
    return;
  }
  const value = (id) => document.getElementById(id)?.value ?? "";
  if (document.getElementById("displayName")) {
    draft.displayName = value("displayName");
    draft.description = value("description");
    draft.role = value("role");
    draft.instructions = value("instructions");
    draft.readonly = Boolean(document.getElementById("readonly")?.checked);
    draft.isBackground = Boolean(document.getElementById("isBackground")?.checked);
  }
  if (document.getElementById("responsibilities")) {
    draft.scope = value("scope") || draft.scope;
    draft.profileId = value("profileId") || undefined;
    draft.responsibilities = lines(value("responsibilities"));
    draft.constraints = lines(value("constraints"));
    draft.model = value("model") || "inherit";
    draft.outputFormat = value("outputFormat");
    draft.behavior = value("behavior");
    draft.projectRules = value("projectRules");
    draft.skills = value("skills");
  }
  if (draft.displayName) {
    const slug = draft.displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!draft.persistedSlug) {
      draft.slug = slug || "agent";
    }
  }
}

function blankFromTemplate(template) {
  return {
    ...template.draft,
    slug: "",
    scope: state.snapshot?.hasWorkspace ? "workspace" : "global",
    context: [...state.createContext],
    persistedSlug: false,
  };
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  const action = target.dataset.action;
  if (action === "new-orchestra") {
    state.orchestra = blankOrchestra();
    state.screen = "orchestra";
    state.notice = "";
    render();
    return;
  }
  if (action === "edit-orchestra") {
    const orchestra = state.snapshot.orchestras.find((item) => item.scope === target.dataset.scope && item.slug === target.dataset.slug);
    state.orchestra = {
      ...orchestra,
      originalSlug: orchestra.slug,
      originalScope: orchestra.scope,
      steps: orchestra.steps.map((step) => ({ ...step })),
      persistedSlug: true,
    };
    state.screen = "orchestra";
    state.notice = "";
    render();
    return;
  }
  if (action === "add-step") {
    readOrchestraFromDom();
    state.orchestra.steps.push({ scope: "workspace", slug: "", task: "" });
    render();
    return;
  }
  if (action === "step-up" || action === "step-down" || action === "step-remove") {
    readOrchestraFromDom();
    const index = Number(target.dataset.index);
    const steps = state.orchestra.steps;
    if (action === "step-remove") {
      steps.splice(index, 1);
    } else if (action === "step-up" && index > 0) {
      [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    } else if (action === "step-down" && index < steps.length - 1) {
      [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
    }
    render();
    return;
  }
  if (action === "save-orchestra") {
    readOrchestraFromDom();
    post({ type: "saveOrchestra", draft: state.orchestra });
    return;
  }
  if (action === "delete-orchestra") {
    if (!window.confirm(`Delete orchestra "${state.orchestra.displayName}"?`)) {
      return;
    }
    post({ type: "deleteOrchestra", scope: state.orchestra.scope, slug: state.orchestra.slug });
    state.screen = "list";
    render();
    return;
  }
  if (action === "run-orchestra") {
    if (!state.orchestra.persistedSlug) {
      state.notice = "Save the orchestra first.";
      render();
      return;
    }
    post({ type: "runOrchestra", scope: state.orchestra.scope, slug: state.orchestra.slug });
    return;
  }
  if (action === "new") {
    state.screen = "create";
    state.notice = "";
    state.createContext = [];
    render();
    return;
  }
  if (action === "back") {
    state.screen = "list";
    state.notice = "";
    render();
    return;
  }
  if (action === "edit") {
    const agent = state.snapshot.agents.find((item) => item.scope === target.dataset.scope && item.slug === target.dataset.slug);
    state.draft = { ...agent, context: [...agent.context], responsibilities: [...agent.responsibilities], constraints: [...agent.constraints], persistedSlug: true };
    state.screen = "editor";
    state.notice = agent.imported ? "This file was imported from Cursor's agents folder. Saving rewrites it in Agent Studio's sectioned prompt." : "";
    render();
    return;
  }
  if (action === "template") {
    const template = state.snapshot.templates.find((item) => item.id === target.dataset.id);
    state.draft = blankFromTemplate(template);
    state.screen = "editor";
    state.notice = `Started from ${template.name}. Review it, then save. Saving writes .cursor/agents or ~/.cursor/agents.`;
    render();
    return;
  }
  if (action === "mode") {
    readDraftFromDom();
    state.mode = target.dataset.mode;
    render();
    return;
  }
  if (action === "generate") {
    state.createPrompt = document.getElementById("createPrompt").value;
    state.createScope = document.getElementById("createScope").value;
    post({ type: "generate", prompt: state.createPrompt, scope: state.createScope, context: state.createContext });
    return;
  }
  if (action === "save") {
    readDraftFromDom();
    if (
      state.draft.imported &&
      !window.confirm("This agent was imported from an existing Markdown file. Saving will rewrite its prompt into Agent Studio's structured format. Continue?")
    ) {
      return;
    }
    post({ type: "save", draft: state.draft });
    return;
  }
  if (action === "duplicate") {
    post({ type: "duplicate", scope: state.draft.scope, slug: state.draft.slug });
    return;
  }
  if (action === "remove") {
    if (!window.confirm(`Delete agent "${state.draft.displayName}"? This removes its Cursor agent file.`)) {
      return;
    }
    post({ type: "delete", scope: state.draft.scope, slug: state.draft.slug });
    state.screen = "list";
    render();
    return;
  }
  if (action === "inspect" || action === "refresh-preview") {
    readDraftFromDom();
    state.screen = "inspector";
    post({ type: "preview", draft: state.draft });
    render();
    return;
  }
  if (action === "back-editor") {
    state.screen = "editor";
    render();
    return;
  }
  if (action === "pick") {
    readDraftFromDom();
    post({ type: "pickContext", kind: target.dataset.kind });
    return;
  }
  if (action === "ctx-remove" || action === "ctx-up" || action === "ctx-down") {
    readDraftFromDom();
    const index = Number(target.dataset.index);
    const list = state.screen === "create" ? state.createContext : state.draft.context;
    if (action === "ctx-remove") {
      list.splice(index, 1);
    } else if (action === "ctx-up" && index > 0) {
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
    } else if (action === "ctx-down" && index < list.length - 1) {
      [list[index + 1], list[index]] = [list[index], list[index + 1]];
    }
    render();
    return;
  }
  if (action === "edit-profile") {
    const profile = (state.snapshot?.profiles || []).find((item) => item.id === target.dataset.id);
    if (!profile) {
      return;
    }
    state.profileForm = {
      id: profile.builtin ? "" : profile.id,
      name: profile.builtin ? `${profile.name} copy` : profile.name,
      summary: profile.summary,
      expertise: profile.expertise.join("\n"),
      principles: profile.principles.join("\n"),
      communication: profile.communication.join("\n"),
    };
    render();
    return;
  }
  if (action === "save-profile") {
    const name = document.getElementById("profileName")?.value.trim() || "";
    if (!name) {
      state.notice = "Name the profile first.";
      render();
      return;
    }
    post({
      type: "saveProfile",
      profile: {
        id: state.profileForm.id || undefined,
        name,
        summary: document.getElementById("profileSummary")?.value.trim() || "",
        expertise: lines(document.getElementById("profileExpertise")?.value),
        principles: lines(document.getElementById("profilePrinciples")?.value),
        communication: lines(document.getElementById("profileCommunication")?.value),
      },
    });
    state.profileForm = emptyProfileForm();
    state.notice = "";
    return;
  }
  if (action === "delete-profile") {
    if (!window.confirm("Delete this custom profile?")) {
      return;
    }
    post({ type: "deleteProfile", id: target.dataset.id });
    return;
  }
  if (action === "save-preset") {
    readDraftFromDom();
    post({ type: "savePreset", name: `${state.draft.displayName || "Agent"} context`, context: state.draft.context });
  }
});

document.body.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    state.query = event.target.value;
    render();
    return;
  }
  const profileFields = {
    profileName: "name",
    profileSummary: "summary",
    profileExpertise: "expertise",
    profilePrinciples: "principles",
    profileCommunication: "communication",
  };
  const key = profileFields[event.target.id];
  if (key) {
    state.profileForm[key] = event.target.value;
  }
});

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "snapshot") {
    state.snapshot = message.snapshot;
    if (!message.snapshot.hasWorkspace) {
      state.createScope = "global";
    }
    render();
    return;
  }
  if (message.type === "create") {
    state.screen = "create";
    state.createContext = message.context || [];
    state.notice = state.createContext.length ? "The current selection is attached. Describe the specialty, then generate." : "";
    render();
    return;
  }
  if (message.type === "focusSearch") {
    state.screen = "list";
    render();
    document.getElementById("search")?.focus();
    return;
  }
  if (message.type === "openAgent") {
    state.draft = { ...message.agent, context: [...message.agent.context], responsibilities: [...message.agent.responsibilities], constraints: [...message.agent.constraints], persistedSlug: true };
    state.screen = message.screen;
    if (message.screen === "inspector") {
      post({ type: "preview", draft: state.draft });
    }
    render();
    return;
  }
  if (message.type === "generated") {
    state.draft = { ...message.draft, persistedSlug: false };
    state.screen = "editor";
    state.notice = message.note;
    render();
    return;
  }
  if (message.type === "saved") {
    state.draft = { ...message.agent, context: [...message.agent.context], responsibilities: [...message.agent.responsibilities], constraints: [...message.agent.constraints], persistedSlug: true };
    state.screen = "editor";
    state.notice = `Saved as a Cursor subagent at ${message.agent.nativePath}`;
    render();
    return;
  }
  if (message.type === "previewResult") {
    state.preview = message;
    if (state.screen === "inspector") {
      render();
    }
    return;
  }
  if (message.type === "contextPicked") {
    const list = state.screen === "create" ? state.createContext : state.draft?.context;
    if (list) {
      list.push(...message.items);
      state.notice = message.items.length ? "Context added." : "Nothing was added.";
      render();
    }
    return;
  }
  if (message.type === "orchestraSaved") {
    state.orchestra = {
      ...message.orchestra,
      originalSlug: message.orchestra.slug,
      originalScope: message.orchestra.scope,
      steps: message.orchestra.steps.map((step) => ({ ...step })),
      persistedSlug: true,
    };
    state.screen = "orchestra";
    state.notice = `Saved the runbook at ${message.orchestra.nativePath}`;
    render();
    return;
  }
  if (message.type === "notice") {
    state.notice = message.message;
    render();
  }
});

post({ type: "ready" });
