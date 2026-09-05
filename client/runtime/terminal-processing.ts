import type { Unsubscribe } from "./events.ts";
import type { Session, TerminalOutputEvent } from "./session.ts";
import { createTerminalAutomation, type TerminalOutputFragment } from "../terminal/automation.ts";

// @ts-expect-error Shared output processing is JavaScript for legacy compatibility.
import { createTerminalOutputModel } from "../../public/js/terminal-output-model.mjs";

export interface TerminalProcessing {
  appendOutput(text: string, cssClass?: string): void;
  appendSystemMessage(text: string): void;
  clear(): void;
  executeCommand(text: string): boolean;
  getMappedCommand(event: KeyboardEvent): string | null;
  subscribe(listener: (event: TerminalOutputEvent) => void): Unsubscribe;
  dispose(): void;
}

/** One Phase 2 session owner for text processing and automation. */
export function createTerminalProcessing(
  session: Session,
  subscribeText: (listener: (text: string) => void) => Unsubscribe,
): TerminalProcessing {
  const output = createTerminalOutputModel({
    processLine: (text: string, fragments: TerminalOutputFragment[]) =>
      automation.processLine(text, fragments),
    onOutputLine: session.notifications.recordOutputLine,
    onClear: session.notifications.resetOutputLines,
  });
  const automation: ReturnType<typeof createTerminalAutomation> = createTerminalAutomation({
    session,
    appendSystemMessage: output.appendSystemMessage,
  });
  const unsubscribeText = subscribeText(output.appendOutput);
  let previousConnectionState = session.getConnectionSnapshot().state;
  const unsubscribeConnection = session.subscribeConnection((snapshot) => {
    if (previousConnectionState === "connected" && snapshot.state !== "connected") {
      output.resetStream();
    }
    previousConnectionState = snapshot.state;
  });

  return {
    appendOutput: output.appendOutput,
    appendSystemMessage: output.appendSystemMessage,
    clear: output.clear,
    executeCommand: automation.sendCommand,
    getMappedCommand: automation.getMappedCommand,
    subscribe: output.subscribe,
    dispose() {
      unsubscribeConnection();
      unsubscribeText();
      automation.dispose();
      output.dispose();
    },
  };
}
