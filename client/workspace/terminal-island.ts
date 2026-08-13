import { findLifecycleDiagnostics } from "./lifecycle-diagnostics";

export interface TerminalIslandSnapshot {
  buffer: string;
  identity: string;
  scrollTop: number;
}

export interface TerminalIsland {
  readonly element: HTMLElement;
  append?(text: string): void;
  focus(): void;
  replace?(text: string): void;
  snapshot(): TerminalIslandSnapshot;
  dispose(): void;
}

export interface TerminalIslandObservation {
  buffer: string;
  connected: boolean;
  focused: boolean;
  identity: string;
  scrollTop: number;
}

let terminalSequence = 0;
const terminalIslands = new Map<string, TerminalIsland>();

/** Read-only workspace observation for the terminal implementation mounted by the panel. */
export function registerTerminalIsland(element: HTMLElement, panelId: string): TerminalIsland {
  const identity = `terminal-${++terminalSequence}`;
  const diagnostics = findLifecycleDiagnostics(element);
  const releaseTerminal = diagnostics?.trackTerminalIsland(panelId);
  let disposed = false;

  element.dataset.panelId = panelId;
  element.dataset.terminalIdentity = identity;
  element.dataset.testid = "terminal-viewport";
  element.dataset.workspaceOwned = "true";

  const island: TerminalIsland = {
    element,
    focus: () => element.focus({ preventScroll: true }),
    snapshot: () => ({ buffer: element.textContent ?? "", identity, scrollTop: element.scrollTop }),
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      releaseTerminal?.();
      if (terminalIslands.get(panelId) === island) {
        terminalIslands.delete(panelId);
      }
    },
  };

  terminalIslands.set(panelId, island);
  return island;
}

/** The Phase 0 harness keeps its deliberately synthetic island for its own tests. */
export function createTerminalIsland(host: HTMLElement, panelId: string): TerminalIsland {
  const viewport = document.createElement("pre");
  let buffer = "";
  viewport.style.cssText =
    "height: 100%; min-height: 0; margin: 0; overflow: auto; white-space: pre-wrap;";
  viewport.tabIndex = 0;
  host.append(viewport);
  const island = registerTerminalIsland(viewport, panelId);
  const synthetic: TerminalIsland = {
    ...island,
    append(text) {
      buffer += text;
      viewport.textContent = buffer;
    },
    replace(text) {
      buffer = text;
      viewport.textContent = buffer;
    },
    snapshot: () => ({
      buffer,
      identity: island.snapshot().identity,
      scrollTop: viewport.scrollTop,
    }),
    dispose: () => {
      island.dispose();
      if (terminalIslands.get(panelId) === synthetic) terminalIslands.delete(panelId);
      viewport.remove();
    },
  };
  terminalIslands.set(panelId, synthetic);
  return synthetic;
}

export function appendTerminalIsland(panelId: string, text: string): void {
  terminalIslands.get(panelId)?.append?.(text);
}

export function focusTerminalIsland(panelId: string): void {
  const island = terminalIslands.get(panelId);
  if (!island) {
    return;
  }

  const restoreFocus = () => {
    if (island.element.isConnected) {
      island.focus();
    }
  };
  restoreFocus();
  queueMicrotask(restoreFocus);
  requestAnimationFrame(restoreFocus);
}

export function scrollTerminalIsland(panelId: string, scrollTop: number): void {
  const island = terminalIslands.get(panelId);
  if (island) {
    island.element.scrollTop = scrollTop;
  }
}

export function inspectTerminalIsland(panelId: string): TerminalIslandObservation | null {
  const island = terminalIslands.get(panelId);
  if (!island) {
    return null;
  }

  const snapshot = island.snapshot();
  return {
    buffer: snapshot.buffer,
    connected: island.element.isConnected,
    focused: document.activeElement === island.element,
    identity: snapshot.identity,
    scrollTop: snapshot.scrollTop,
  };
}
