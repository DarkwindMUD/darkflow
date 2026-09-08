import type { EffectiveConfigurationSnapshot } from "../configuration/snapshot";
import type { Session } from "../runtime/session";
import { loadCommandHistory, saveCommandHistory } from "./history";
import { loadClientSettings } from "../app/client-settings";
import { createMentionPicker } from "./mention-picker";
// @ts-expect-error Shared emoji picker is legacy JavaScript without declarations.
import * as emojiPicker from "../../public/js/emoji-picker.js";

// @ts-expect-error Shared legacy/Phase 2 completion core is JavaScript.
import { createCompletionController } from "../../public/js/completion-core.mjs";

const { handleEmojiPickerKeydown, initEmojiPicker, updateEmojiPicker } = emojiPicker;

const BATCH_COMMAND_DELAY_MS = 75;

function extractBatchCommands(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName))
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function isBlockingDialogTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const dialog = target.closest<HTMLElement>('dialog, [role="dialog"]');
  return dialog !== null && !dialog.classList.contains("dv-resize-container");
}

/** One native command input bound only to the public session terminal capability. */
export function createTerminalInputController({
  session,
  input,
  sendButton,
  output,
  batchDialog,
  batchInput,
  batchForm,
  appendEcho,
  appendSystemMessage,
  executeCommand,
  getMappedCommand,
  returnOutputToLive,
}: {
  session: Session;
  input: HTMLInputElement;
  sendButton: HTMLButtonElement;
  output: HTMLElement;
  batchDialog: HTMLDialogElement;
  batchInput: HTMLTextAreaElement;
  batchForm: HTMLFormElement;
  appendEcho: (text: string) => void;
  appendSystemMessage: (text: string) => void;
  executeCommand?: (text: string) => boolean;
  getMappedCommand?: (event: KeyboardEvent) => string | null;
  returnOutputToLive?: () => boolean;
}): { dispose(): void } {
  let history = loadCommandHistory(localStorage, session.characterProfileId);
  let historyIndex = history.length;
  let savedInput = "";
  let saveTimer: number | undefined;
  let persistencePaused = false;
  const batchTimers = new Set<number>();
  let aliases: EffectiveConfigurationSnapshot["aliases"] = [];

  const flushHistory = () => {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (persistencePaused) return;
    saveCommandHistory(localStorage, session.characterProfileId, history);
  };
  const pausePersistence = () => {
    flushHistory();
    persistencePaused = true;
  };
  const resumePersistence = () => {
    persistencePaused = false;
  };
  const saveHistory = () => {
    if (saveTimer === undefined) saveTimer = window.setTimeout(flushHistory, 500);
  };
  const pushHistory = (text: string) => {
    if (!text || text.length > 4096) return;
    history = [...history, text].slice(-200);
    historyIndex = history.length;
    saveHistory();
  };
  const execute = (text: string) => {
    if (!(executeCommand ?? session.terminal.sendCommand)(text)) {
      appendSystemMessage("Not connected.");
      return false;
    }
    if (text) {
      appendEcho(text);
      pushHistory(text);
    }
    mentionPicker.close();
    completion.reset();
    return true;
  };
  const completion = createCompletionController({
    input,
    getHistory: () => history,
    getAliases: () =>
      aliases
        .filter(({ definition }) => definition.enabled)
        .map(({ definition }) => definition.trigger),
    aliasEnabled: () => loadClientSettings(localStorage).settings.aliasTabCompletionEnabled,
    historyEnabled: () => loadClientSettings(localStorage).settings.historyTabCompletionEnabled,
    request: (request: { line: string; cursor: number }) =>
      session.terminal.requestCompletion(request),
    subscribe: (
      listener: (result: {
        line: string;
        cursor: number;
        matches: string[];
        ambiguous: boolean;
      }) => void,
    ) => session.terminal.subscribeCompletion(listener),
    appendSystemMessage,
  });
  const mentionPicker = createMentionPicker({ input, notifications: session.notifications });
  const disposeEmojiPicker = initEmojiPicker(input, {
    isEnabled: () => loadClientSettings(localStorage).settings.emojiPickerEnabled,
  });

  const send = () => {
    const text = input.value;
    if (!execute(text)) return false;
    if (loadClientSettings(localStorage).settings.repeatLastCommand && text) {
      input.value = text;
      input.select();
    } else {
      input.value = "";
    }
    input.focus();
    return true;
  };
  const sendBatch = (commands: string[], index = 0): void => {
    if (index >= commands.length || session.disposed) return;
    sendCommand(commands[index]!);
    if (index + 1 < commands.length) {
      const timer = window.setTimeout(() => {
        batchTimers.delete(timer);
        sendBatch(commands, index + 1);
      }, BATCH_COMMAND_DELAY_MS);
      batchTimers.add(timer);
    }
  };
  const sendCommand = (text: string): void => {
    input.value = text;
    send();
  };
  const openBatch = (commands: string[]) => {
    batchInput.value = commands.join("\n");
    batchDialog.showModal();
    batchInput.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      mentionPicker.handleKeydown(event) ||
      handleEmojiPickerKeydown(event)
    )
      return;
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    } else if (event.key === "Tab") {
      event.preventDefault();
      completion.request();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      completion.reset();
      if (historyIndex === history.length) savedInput = input.value;
      if (historyIndex > 0) input.value = history[--historyIndex]!;
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      completion.reset();
      if (historyIndex < history.length)
        input.value = ++historyIndex === history.length ? savedInput : history[historyIndex]!;
    } else if (
      event.key !== "Shift" &&
      event.key !== "Control" &&
      event.key !== "Alt" &&
      event.key !== "Meta"
    ) {
      completion.reset();
    }
  };
  const onPaste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const commands = extractBatchCommands(
      input.value.slice(0, start) + pasted + input.value.slice(end),
    );
    if (commands.length > 1) {
      event.preventDefault();
      openBatch(commands);
    }
  };
  const onMappedKeydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isEditableTarget(event.target) ||
      isBlockingDialogTarget(event.target)
    )
      return;
    const mappedCommand = getMappedCommand?.(event);
    if (!mappedCommand) return;
    event.preventDefault();
    event.stopPropagation();
    execute(mappedCommand);
  };
  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (isBlockingDialogTarget(event.target)) return;
    if (isInteractiveTarget(event.target) && event.target !== input) return;
    if (event.key === "Escape" && returnOutputToLive?.()) {
      event.preventDefault();
      input.focus();
      return;
    }
    if (isInteractiveTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Escape") {
      completion.reset();
      input.value = "";
      input.focus();
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      output.scrollTop += output.clientHeight * (event.key === "PageUp" ? -0.8 : 0.8);
    } else if (event.key.length === 1) {
      input.focus();
    }
  };
  const onBatchSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const commands = extractBatchCommands(batchInput.value);
    batchDialog.close();
    sendBatch(commands);
  };
  const onSettingsChanged = () => updateEmojiPicker();
  const unsubscribeConfiguration = session.terminal.subscribeConfiguration((snapshot) => {
    aliases = snapshot.aliases;
  });
  const unsubscribeConnection = session.subscribeConnection((snapshot) => {
    if (snapshot.state !== "connected") completion.reset();
  });

  input.addEventListener("keydown", onKeydown);
  input.addEventListener("paste", onPaste);
  sendButton.addEventListener("click", send);
  batchForm.addEventListener("submit", onBatchSubmit);
  document.addEventListener("keydown", onMappedKeydown, true);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("pagehide", flushHistory);
  window.addEventListener("darkflow:settings-import-start", pausePersistence);
  window.addEventListener("darkflow:settings-import-abort", resumePersistence);
  window.addEventListener("darkflow:client-settings-changed", onSettingsChanged);

  return {
    dispose() {
      input.removeEventListener("keydown", onKeydown);
      input.removeEventListener("paste", onPaste);
      sendButton.removeEventListener("click", send);
      batchForm.removeEventListener("submit", onBatchSubmit);
      document.removeEventListener("keydown", onMappedKeydown, true);
      document.removeEventListener("keydown", onDocumentKeydown);
      window.removeEventListener("pagehide", flushHistory);
      window.removeEventListener("darkflow:settings-import-start", pausePersistence);
      window.removeEventListener("darkflow:settings-import-abort", resumePersistence);
      window.removeEventListener("darkflow:client-settings-changed", onSettingsChanged);
      unsubscribeConfiguration();
      unsubscribeConnection();
      mentionPicker.dispose();
      disposeEmojiPicker();
      completion.dispose();
      for (const timer of batchTimers) window.clearTimeout(timer);
      batchTimers.clear();
      if (batchDialog.open) batchDialog.close();
      flushHistory();
    },
  };
}
