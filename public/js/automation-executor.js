import { aliasManager } from './alias-manager.js';
import {
  executeAliasLine as executeAliasLineCore,
  executeAutomationSteps as executeAutomationStepsCore,
  executeTriggerMatches as executeTriggerMatchesCore,
  getAutomationStepLabel,
} from './automation-executor-core.mjs';
import { functionManager } from './function-manager.js';
import { isKnownSound, soundManager } from './sound-manager.js';
import { triggerManager } from './trigger-manager.js';

let timerAutomation = null;

export function registerTimerAutomation(manager) {
  timerAutomation = manager || null;
}

function legacyContext(context = {}) {
  if (context.managers) return context;
  return {
    ...context,
    managers: {
      alias: aliasManager,
      trigger: triggerManager,
      timer: timerAutomation,
      function: functionManager,
    },
    playSound(step) {
      if (!isKnownSound(step.category, step.sound)) return false;
      soundManager.play(step.category, step.sound, step.volume);
      return true;
    },
  };
}

export function executeAutomationSteps(steps, context = {}) {
  return executeAutomationStepsCore(steps, legacyContext(context));
}

export function executeAliasLine(text, context = {}) {
  return executeAliasLineCore(text, legacyContext(context));
}

export function executeTriggerMatches(matches, scopeKey, options = {}) {
  return executeTriggerMatchesCore(matches, scopeKey, legacyContext(options));
}

export { getAutomationStepLabel };
