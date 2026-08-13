import { dom } from './state.js';
import { gmcp } from './gmcp.js';
import { disposeControllerLifecycle, installControllerLifecycle } from './session-compat/controllers.js';
import { appendSystemMessage } from './output.js';
import { settingsManager } from './settings-manager.js';
import { aliasManager } from './alias-manager.js';
import { createCompletionController } from './completion-core.mjs';

const completionController = {};
let completion = null;
let commandHistory = [];
let completionInput = null;

function createLegacyCompletion(history, subscribe) {
  return createCompletionController({
    input: dom.commandInput,
    getHistory: () => commandHistory,
    getAliases: () => aliasManager.listCompletionTriggers(),
    aliasEnabled: () => settingsManager.get('aliasTabCompletionEnabled'),
    historyEnabled: () => settingsManager.get('historyTabCompletionEnabled'),
    request: (request) => gmcp.send('Darkwind.Completion.Request', request),
    subscribe,
    appendSystemMessage,
  });
}

export function initCompletion() {
  return installControllerLifecycle(completionController, 'completion', gmcp, (scopedGmcp, lifecycle) => {
    completion = createLegacyCompletion([], (listener) => {
      scopedGmcp.on('Darkwind.Completion.Result', listener);
      return () => scopedGmcp.off('Darkwind.Completion.Result', listener);
    });
    lifecycle.own('teardown', () => {
      completion?.dispose();
      completion = null;
      completionInput = null;
    });
  }, resetCompletionState);
}

export function disposeCompletion() {
  disposeControllerLifecycle(completionController);
}

export function resetCompletionState() {
  completion?.reset();
}

export function requestCompletion(history = []) {
  commandHistory = history;
  if (completion && completionInput !== dom.commandInput) {
    completion.dispose();
    completion = null;
  }
  if (!completion) {
    completion = createLegacyCompletion([], () => () => {});
    completionInput = dom.commandInput;
  }
  completion.request();
}
