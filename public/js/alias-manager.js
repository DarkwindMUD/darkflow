import { dom } from './state.js';
import { getAutomationScriptDiagnostics } from './automation-script-core.mjs';
import { tokenizeInput } from './completion-core.mjs';
import { matchAliasDefinitions, resolveDefinitionTemplate } from './definition-runtime-core.mjs';
import { getGmcpVariables } from './gmcp-variables.js';
import {
  getActiveCharacterProfileId,
  getEffectiveDefinitions,
  isConfigurationCompatActive,
  removeLocalDefinitionByIdentity,
  replaceLocalDefinitions,
  setLocalDefinitionEnabledByIdentity,
  upsertLocalDefinitionByIdentity,
} from './session-compat/configuration.js';
import {
  getAutomationVariables as bridgeGetAutomationVariables,
  getVariable as bridgeGetVariable,
  isAutomationCompatActive,
  listVariableNames as bridgeListVariableNames,
  removeVariable as bridgeRemoveVariable,
  setVariable as bridgeSetVariable,
} from './session-compat/automation.js';

const ALIAS_STORAGE_KEY = 'darkwind-client-aliases-v1';
const MAX_ALIAS_DEPTH = 10;
const MAX_WAIT_SECONDS = 24 * 60 * 60;

function createId() {
  return 'alias-' + Math.random().toString(36).slice(2, 10);
}

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeWaitSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(MAX_WAIT_SECONDS, number));
}

function compileRegex(source, ignoreCase) {
  const pattern = String(source || '').trim();
  if (!pattern) return { regex: null, error: 'Alias trigger is required.' };

  try {
    return {
      regex: new RegExp(pattern, ignoreCase ? 'i' : ''),
      error: null,
    };
  } catch (error) {
    return {
      regex: null,
      error: error instanceof Error ? error.message : 'Invalid regex.',
    };
  }
}

function emitAliasDataChanged(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('darkwind:alias-data-changed', {
    detail: detail || null,
  }));
}

function normalizeStep(step) {
  if (!step || typeof step !== 'object') return null;
  const type = typeof step.type === 'string' ? step.type : 'send_command';

  if (type === 'set_variable') {
    const name = normalizeWhitespace(step.name);
    return name
      ? { type, name, template: String(step.template || '') }
      : null;
  }

  if (type === 'show_message') {
    return { type, template: String(step.template || '') };
  }

  if (type === 'script') {
    return { type, script: String(step.script || '') };
  }

  if (type === 'wait') {
    return { type, seconds: normalizeWaitSeconds(step.seconds) };
  }

  if (type === 'set_trigger_enabled' || type === 'set_timer_enabled') {
    const mode = step.mode === 'enable' || step.mode === 'disable' ? step.mode : 'toggle';
    return { type, mode, target: String(step.target || ''), targetId: String(step.targetId || '') };
  }

  if (type === 'control_timer') {
    const mode = step.mode === 'stop' || step.mode === 'reset' ? step.mode : 'start';
    return { type, mode, target: String(step.target || ''), targetId: String(step.targetId || '') };
  }

  if (type === 'run_alias') {
    return { type, template: String(step.template || '') };
  }

  if (type === 'call_function') {
    return {
      type,
      target: String(step.target || ''),
      targetId: String(step.targetId || ''),
      template: String(step.template || ''),
    };
  }

  return { type: 'send_command', template: String(step.template || '') };
}

function normalizeAlias(alias) {
  if (!alias || typeof alias !== 'object') return null;
  const trigger = normalizeWhitespace(alias.trigger);
  if (!trigger) return null;

  const steps = Array.isArray(alias.steps)
    ? alias.steps.map(normalizeStep).filter(Boolean)
    : [];

  return {
    id: typeof alias.id === 'string' && alias.id ? alias.id : createId(),
    enabled: alias.enabled !== false,
    trigger,
    isRegex: Boolean(alias.isRegex),
    ignoreCase: alias.ignoreCase !== false,
    description: String(alias.description || ''),
    group: normalizeWhitespace(alias.group),
    steps: steps.length ? steps : [{ type: 'send_command', template: '' }],
  };
}

function normalizeVariables(variables) {
  const normalized = {};
  if (!variables || typeof variables !== 'object') return normalized;

  for (const [key, value] of Object.entries(variables)) {
    const name = normalizeWhitespace(key);
    if (!name) continue;
    normalized[name] = String(value ?? '');
  }

  return normalized;
}

function normalizeScope(scope) {
  const aliases = Array.isArray(scope && scope.aliases)
    ? scope.aliases.map(normalizeAlias).filter(Boolean)
    : [];

  return {
    aliases,
    variables: normalizeVariables(scope && scope.variables),
  };
}

function aliasIdentityKey(trigger) {
  return normalizeWhitespace(trigger).toLowerCase();
}

function cloneAliasDefinition(alias) {
  return {
    ...alias,
    steps: alias.steps.map((step) => ({ ...step })),
  };
}

function getEffectiveAliasEntries() {
  return getEffectiveDefinitions('aliases');
}

function getEffectiveAliasDefinitions() {
  return getEffectiveAliasEntries().map((entry) => cloneAliasDefinition(entry.definition));
}

function normalizeData(data) {
  const scopes = {};
  if (data && typeof data === 'object' && data.scopes && typeof data.scopes === 'object') {
    for (const [scopeKey, scope] of Object.entries(data.scopes)) {
      scopes[scopeKey] = normalizeScope(scope);
    }
  }
  return { scopes };
}

function collectVariableNamesFromText(text) {
  return (String(text || '').match(/\$([A-Za-z_][A-Za-z0-9_]*)/g) || [])
    .map((match) => match.slice(1));
}

export const aliasManager = {
  _data: { scopes: {} },

  init() {
    try {
      const raw = localStorage.getItem(ALIAS_STORAGE_KEY);
      if (raw) {
        this._data = normalizeData(JSON.parse(raw));
        return;
      }
    } catch (error) {
      console.warn('Failed to load aliases', error);
    }

    this._data = { scopes: {} };
  },

  _save(detail = null) {
    try {
      localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(this._data));
      emitAliasDataChanged({
        scopeKey: detail && detail.scopeKey ? detail.scopeKey : this.getActiveScopeKey(),
        ...detail,
      });
    } catch (error) {
      console.warn('Failed to save aliases', error);
    }
  },

  getMaxAliasDepth() {
    return MAX_ALIAS_DEPTH;
  },

  getActiveScopeKey() {
    if (isConfigurationCompatActive()) {
      return getActiveCharacterProfileId();
    }
    const host = normalizeWhitespace(dom.host && dom.host.value ? dom.host.value : '').toLowerCase() || 'default';
    const port = normalizeWhitespace(dom.port && dom.port.value ? dom.port.value : '') || '4242';
    // Preserve existing scope keys: secure (wss/telnets) → 'wss', plain → 'ws'.
    const sel = dom.protocolSelect && dom.protocolSelect.value;
    const protocol = (sel === 'wss' || sel === 'telnets') ? 'wss' : 'ws';
    return protocol + '://' + host + ':' + port;
  },

  _ensureScope(scopeKey) {
    if (!this._data.scopes[scopeKey]) {
      this._data.scopes[scopeKey] = { aliases: [], variables: {} };
    }
    return this._data.scopes[scopeKey];
  },

  getScopeSnapshot(scopeKey = this.getActiveScopeKey()) {
    if (isConfigurationCompatActive()) {
      return {
        aliases: getEffectiveAliasDefinitions(),
        variables: { ...this._ensureScope(scopeKey).variables },
      };
    }
    const scope = normalizeScope(this._ensureScope(scopeKey));
    return {
      aliases: scope.aliases.map((alias) => cloneAliasDefinition(alias)),
      variables: { ...scope.variables },
    };
  },

  getScopeSnapshotWithSource(scopeKey = this.getActiveScopeKey()) {
    if (isConfigurationCompatActive()) {
      const entries = getEffectiveAliasEntries();
      return {
        aliases: entries.map((entry) => ({
          ...cloneAliasDefinition(entry.definition),
          source: entry.source,
        })),
        variables: { ...this._ensureScope(scopeKey).variables },
      };
    }
    const scope = normalizeScope(this._ensureScope(scopeKey));
    return {
      aliases: scope.aliases.map((alias) => cloneAliasDefinition(alias)),
      variables: { ...scope.variables },
    };
  },

  saveScope(scopeKey, scope) {
    if (isConfigurationCompatActive()) {
      replaceLocalDefinitions('aliases', normalizeScope(scope).aliases);
      const existing = this._ensureScope(scopeKey);
      existing.variables = normalizeVariables(scope && scope.variables);
      this._save({ scopeKey });
      return;
    }
    this._data.scopes[scopeKey] = normalizeScope(scope);
    this._save({ scopeKey });
  },

  createEmptyAlias() {
    return {
      id: createId(),
      enabled: true,
      trigger: '',
      isRegex: false,
      ignoreCase: true,
      description: '',
      group: '',
      steps: [{ type: 'send_command', template: '' }],
    };
  },

  listVariableNames(scopeKey = this.getActiveScopeKey()) {
    if (isAutomationCompatActive()) {
      return bridgeListVariableNames();
    }
    return Object.keys(this._ensureScope(scopeKey).variables).sort((a, b) => a.localeCompare(b));
  },

  getAutomationVariables(scopeKey = this.getActiveScopeKey()) {
    if (isAutomationCompatActive()) {
      return bridgeGetAutomationVariables();
    }
    const scopeVariables = this._ensureScope(scopeKey).variables;
    return {
      ...getGmcpVariables(),
      ...scopeVariables,
    };
  },

  getVariable(name, scopeKey = this.getActiveScopeKey()) {
    if (isAutomationCompatActive()) {
      return bridgeGetVariable(name);
    }
    return this._ensureScope(scopeKey).variables[name];
  },

  setVariable(name, value, scopeKey = this.getActiveScopeKey()) {
    if (isAutomationCompatActive()) {
      return bridgeSetVariable(name, value);
    }
    const cleanName = normalizeWhitespace(name);
    if (!cleanName) return false;
    this._ensureScope(scopeKey).variables[cleanName] = String(value ?? '');
    this._save({ scopeKey });
    return true;
  },

  removeVariable(name, scopeKey = this.getActiveScopeKey()) {
    if (isAutomationCompatActive()) {
      bridgeRemoveVariable(name);
      return;
    }
    if (!name) return;
    delete this._ensureScope(scopeKey).variables[name];
    this._save({ scopeKey });
  },

  findAliasByTrigger(trigger, scopeKey = this.getActiveScopeKey()) {
    const normalizedTrigger = aliasIdentityKey(trigger);
    if (!normalizedTrigger) return null;
    if (isConfigurationCompatActive()) {
      const entry = getEffectiveAliasEntries().find(
        (item) => aliasIdentityKey(item.definition.trigger) === normalizedTrigger,
      );
      return entry ? cloneAliasDefinition(entry.definition) : null;
    }
    return this._ensureScope(scopeKey).aliases.find((alias) => (
      aliasIdentityKey(alias.trigger) === normalizedTrigger
    )) || null;
  },

  findAliasByTriggerWithSource(trigger, scopeKey = this.getActiveScopeKey()) {
    const normalizedTrigger = aliasIdentityKey(trigger);
    if (!normalizedTrigger) return null;
    if (isConfigurationCompatActive()) {
      const entry = getEffectiveAliasEntries().find(
        (item) => aliasIdentityKey(item.definition.trigger) === normalizedTrigger,
      );
      if (!entry) return null;
      return {
        ...cloneAliasDefinition(entry.definition),
        source: entry.source,
      };
    }
    const alias = this.findAliasByTrigger(trigger, scopeKey);
    return alias ? cloneAliasDefinition(alias) : null;
  },

  listCompletionTriggers(scopeKey = this.getActiveScopeKey()) {
    const seen = new Set();
    const aliases = isConfigurationCompatActive()
      ? getEffectiveAliasDefinitions()
      : this._ensureScope(scopeKey).aliases;
    return aliases
      .filter((alias) => alias.enabled !== false && !alias.isRegex)
      .map((alias) => normalizeWhitespace(alias.trigger))
      .filter(Boolean)
      .filter((trigger) => {
        const key = trigger.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  },

  upsertSimpleAlias(trigger, template, scopeKey = this.getActiveScopeKey(), options = {}) {
    const normalizedTrigger = normalizeWhitespace(trigger);
    if (!normalizedTrigger) return { alias: null, error: 'Alias trigger is required.' };
    const isRegex = options.isRegex === true;
    const ignoreCase = options.ignoreCase !== false;
    if (isRegex) {
      const compiled = compileRegex(normalizedTrigger, ignoreCase);
      if (compiled.error) {
        return { alias: null, error: compiled.error };
      }
    }

    const existing = this.findAliasByTrigger(normalizedTrigger, scopeKey);
    const normalizedTemplate = String(template || '').trim();
    const alias = existing || {
      id: createId(),
      enabled: true,
      trigger: normalizedTrigger,
      description: '',
      steps: [],
    };

    alias.enabled = true;
    alias.trigger = normalizedTrigger;
    alias.isRegex = isRegex;
    alias.ignoreCase = ignoreCase;
    alias.steps = [{ type: 'send_command', template: normalizedTemplate }];

    if (isConfigurationCompatActive()) {
      const normalizedAlias = normalizeAlias(alias);
      if (!normalizedAlias) {
        return { alias: null, error: 'Alias trigger is required.' };
      }
      upsertLocalDefinitionByIdentity('aliases', normalizedAlias);
      emitAliasDataChanged({ scopeKey });
    } else {
      const scope = this._ensureScope(scopeKey);
      if (!existing) {
        scope.aliases.push(alias);
      }
      this._save({ scopeKey });
    }

    const snapshot = cloneAliasDefinition(alias);

    return {
      ...snapshot,
      alias: snapshot,
      error: null,
    };
  },

  removeAliasByTrigger(trigger, scopeKey = this.getActiveScopeKey()) {
    const normalizedTrigger = aliasIdentityKey(trigger);
    if (!normalizedTrigger) return false;

    if (isConfigurationCompatActive()) {
      const removed = removeLocalDefinitionByIdentity('aliases', normalizedTrigger);
      if (removed) emitAliasDataChanged({ scopeKey });
      return removed;
    }

    const scope = this._ensureScope(scopeKey);
    const nextAliases = scope.aliases.filter((alias) => (
      aliasIdentityKey(alias.trigger) !== normalizedTrigger
    ));

    if (nextAliases.length === scope.aliases.length) return false;
    scope.aliases = nextAliases;
    this._save({ scopeKey });
    return true;
  },

  setEnabledByTarget(trigger, enabled, scopeKey = this.getActiveScopeKey()) {
    const alias = this.findAliasByTrigger(trigger, scopeKey);
    if (!alias) return { target: null, enabled: null };
    if (isConfigurationCompatActive()) {
      const nextEnabled = enabled !== false;
      const changed = setLocalDefinitionEnabledByIdentity('aliases', aliasIdentityKey(trigger), nextEnabled);
      if (changed) emitAliasDataChanged({ scopeKey });
      return { target: alias, enabled: changed ? nextEnabled : alias.enabled };
    }
    alias.enabled = enabled !== false;
    this._save({ scopeKey });
    return { target: alias, enabled: alias.enabled };
  },

  findAliasById(id, scopeKey = this.getActiveScopeKey()) {
    const key = String(id || '');
    if (!key) return null;
    if (isConfigurationCompatActive()) {
      const entry = getEffectiveAliasEntries().find((item) => item.definition.id === key);
      return entry ? cloneAliasDefinition(entry.definition) : null;
    }
    return this._ensureScope(scopeKey).aliases.find((alias) => alias.id === key) || null;
  },

  findAliasByIdWithSource(id, scopeKey = this.getActiveScopeKey()) {
    const key = String(id || '');
    if (!key) return null;
    if (isConfigurationCompatActive()) {
      const entry = getEffectiveAliasEntries().find((item) => item.definition.id === key);
      if (!entry) return null;
      return {
        ...cloneAliasDefinition(entry.definition),
        source: entry.source,
      };
    }
    const alias = this.findAliasById(id, scopeKey);
    return alias ? cloneAliasDefinition(alias) : null;
  },

  setEnabledById(id, enabled, scopeKey = this.getActiveScopeKey()) {
    const alias = this.findAliasById(id, scopeKey);
    if (!alias) return { target: null, enabled: null };
    if (isConfigurationCompatActive()) {
      const nextEnabled = enabled !== false;
      const changed = setLocalDefinitionEnabledByIdentity('aliases', aliasIdentityKey(alias.trigger), nextEnabled);
      if (changed) emitAliasDataChanged({ scopeKey });
      return { target: alias, enabled: changed ? nextEnabled : alias.enabled };
    }
    alias.enabled = enabled !== false;
    this._save({ scopeKey });
    return { target: alias, enabled: alias.enabled };
  },

  toggleEnabledById(id, scopeKey = this.getActiveScopeKey()) {
    const alias = this.findAliasById(id, scopeKey);
    if (!alias) return { target: null, enabled: null };
    const nextEnabled = alias.enabled === false;
    if (isConfigurationCompatActive()) {
      const changed = setLocalDefinitionEnabledByIdentity('aliases', aliasIdentityKey(alias.trigger), nextEnabled);
      if (changed) emitAliasDataChanged({ scopeKey });
      return { target: alias, enabled: changed ? nextEnabled : alias.enabled };
    }
    alias.enabled = nextEnabled;
    this._save({ scopeKey });
    return { target: alias, enabled: alias.enabled };
  },

  toggleEnabledByTarget(trigger, scopeKey = this.getActiveScopeKey()) {
    const alias = this.findAliasByTrigger(trigger, scopeKey);
    if (!alias) return { target: null, enabled: null };
    const nextEnabled = alias.enabled === false;
    if (isConfigurationCompatActive()) {
      const changed = setLocalDefinitionEnabledByIdentity('aliases', aliasIdentityKey(trigger), nextEnabled);
      if (changed) emitAliasDataChanged({ scopeKey });
      return { target: alias, enabled: changed ? nextEnabled : alias.enabled };
    }
    alias.enabled = nextEnabled;
    this._save({ scopeKey });
    return { target: alias, enabled: alias.enabled };
  },

  matchAliasInAliases(rawLine, aliases) {
    return matchAliasDefinitions(rawLine, aliases);
  },

  matchAlias(rawLine, scopeKey = this.getActiveScopeKey()) {
    const aliases = isConfigurationCompatActive()
      ? getEffectiveAliasDefinitions()
      : this._ensureScope(scopeKey).aliases;
    return this.matchAliasInAliases(rawLine, aliases);
  },

  resolveTemplate(template, context) {
    return resolveDefinitionTemplate(template, context);
  },

  getAliasDiagnostics(scope, aliasId) {
    const aliases = Array.isArray(scope && scope.aliases) ? scope.aliases : [];
    const alias = aliases.find((item) => item.id === aliasId);
    if (!alias) return [];

    const diagnostics = [];
    const normalizedTrigger = normalizeWhitespace(alias.trigger).toLowerCase();
    if (!normalizedTrigger) {
      diagnostics.push('Pattern is required.');
    } else {
      const duplicate = aliases.find((item) => (
        item.id !== alias.id
        && Boolean(item.isRegex) === Boolean(alias.isRegex)
        && normalizeWhitespace(item.trigger).toLowerCase() === normalizedTrigger
      ));
      if (duplicate) diagnostics.push('Pattern conflicts with another alias in this scope.');
    }

    if (!String(alias.description || '').trim()) {
      diagnostics.push('Name is required.');
    }

    if (alias.isRegex) {
      const compiled = compileRegex(alias.trigger, alias.ignoreCase !== false);
      if (compiled.error) diagnostics.push(compiled.error);
    }

    if (!Array.isArray(alias.steps) || alias.steps.length === 0) {
      diagnostics.push('At least one step is required.');
      return diagnostics;
    }

    for (let index = 0; index < alias.steps.length; index++) {
      const step = alias.steps[index];
      if (!step || !step.type) {
        diagnostics.push('Step ' + (index + 1) + ' is invalid.');
        continue;
      }
      if (step.type === 'set_variable' && !normalizeWhitespace(step.name)) {
        diagnostics.push('Step ' + (index + 1) + ' must choose a variable name.');
      }
      if ((step.type === 'send_command' || step.type === 'show_message' || step.type === 'set_variable')
        && !String(step.template || '').trim()) {
        diagnostics.push('Step ' + (index + 1) + ' must have content.');
      }
      if (step.type === 'wait') {
        const seconds = Number(step.seconds);
        if (!Number.isFinite(seconds) || seconds < 0) {
          diagnostics.push('Step ' + (index + 1) + ' wait time must be 0 seconds or more.');
        }
      }
      if (step.type === 'script') {
        const scriptDiagnostics = getAutomationScriptDiagnostics(step.script || '');
        scriptDiagnostics.forEach((message) => {
          diagnostics.push('Step ' + (index + 1) + ': ' + message);
        });
      }
      if (step.type === 'set_trigger_enabled'
        && !String(step.targetId || '').trim() && !String(step.target || '').trim()) {
        diagnostics.push('Step ' + (index + 1) + ' must select a trigger.');
      }
      if ((step.type === 'set_timer_enabled' || step.type === 'control_timer')
        && !String(step.targetId || '').trim() && !String(step.target || '').trim()) {
        diagnostics.push('Step ' + (index + 1) + ' must select a timer.');
      }
      if (step.type === 'call_function'
        && !String(step.targetId || '').trim() && !String(step.target || '').trim()) {
        diagnostics.push('Step ' + (index + 1) + ' must select a function.');
      }
    }

    return diagnostics;
  },

  collectAliasUsage(scope) {
    const usage = new Map();
    const aliases = Array.isArray(scope && scope.aliases) ? scope.aliases : [];

    for (const alias of aliases) {
      for (const step of alias.steps || []) {
      for (const name of collectVariableNamesFromText(step.template)) {
        const count = usage.get(name) || 0;
        usage.set(name, count + 1);
      }
      for (const name of collectVariableNamesFromText(step.script)) {
        const count = usage.get(name) || 0;
        usage.set(name, count + 1);
      }
      for (const name of collectVariableNamesFromText(step.target)) {
        const count = usage.get(name) || 0;
        usage.set(name, count + 1);
        }
      }
    }

    return usage;
  },

  collectAliasUsageDetails(scope) {
    const usage = new Map();
    const aliases = Array.isArray(scope && scope.aliases) ? scope.aliases : [];

    for (const alias of aliases) {
      const names = new Set();
      for (const step of alias.steps || []) {
        collectVariableNamesFromText(step.template).forEach((name) => names.add(name));
        collectVariableNamesFromText(step.script).forEach((name) => names.add(name));
        collectVariableNamesFromText(step.target).forEach((name) => names.add(name));
      }

      for (const name of names) {
        if (!usage.has(name)) usage.set(name, []);
        usage.get(name).push({
          id: alias.id,
          trigger: alias.trigger || '(untitled)',
          description: alias.description || '',
        });
      }
    }

    return usage;
  },
};

export { tokenizeInput };
