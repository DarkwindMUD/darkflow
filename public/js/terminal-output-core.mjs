import { styleToElement } from './ansi.js';
import { createTerminalOutputModel } from './terminal-output-model.mjs';

const SCREEN_READER_DELAY_MS = 180;

/** One DOM-owned renderer for a terminal output model. */
export function createTerminalOutputCore({
  shell,
  output,
  pauseButton,
  liveButton,
  clearButton,
  announcer,
  subscribeOutput,
  clearOutput,
  processLine,
  onOutputLine,
  onClear,
}) {
  const ownedModel = subscribeOutput
    ? null
    : createTerminalOutputModel({ processLine, onOutputLine, onClear });
  const model = ownedModel ?? {
    subscribe: subscribeOutput,
    clear: clearOutput,
  };
  const pendingLines = [];
  const lineElements = new Map();
  let animationFrame = 0;
  let announceTimer = 0;
  let disposed = false;
  let paused = false;
  let navigationLocked = false;
  let targetLine = null;
  let announceText = '';

  const isAtBottom = () => output.scrollTop + output.clientHeight >= output.scrollHeight - 5;
  const syncControls = () => {
    shell.classList.toggle('paused', paused);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.title = paused ? 'Resume live terminal' : 'Pause live terminal';
  };
  const renderPending = () => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (pendingLines.length) {
      const fragment = document.createDocumentFragment();
      for (const line of pendingLines.splice(0)) fragment.append(line);
      output.append(fragment);
    }
    if (!paused) output.scrollTop = output.scrollHeight;
  };
  const scheduleRender = () => {
    if (animationFrame || disposed) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      renderPending();
    });
  };
  const announce = (text) => {
    announceText = `${announceText}${text}`.slice(-1000);
    if (announceTimer) return;
    announceTimer = window.setTimeout(() => {
      announceTimer = 0;
      announcer.textContent = announceText;
      announceText = '';
    }, SCREEN_READER_DELAY_MS);
  };
  const appendFragment = (line, fragment) => {
    if (!fragment.text) return;
    const rendered = styleToElement(fragment.text, fragment.style);
    if (!rendered) return;
    if (fragment.href) {
      const link = document.createElement('a');
      link.href = fragment.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(rendered);
      line.append(link);
    } else {
      line.append(rendered);
    }
  };
  const renderRecord = (record) => {
    let line = lineElements.get(record.id);
    if (!line) {
      line = document.createElement('div');
      lineElements.set(record.id, line);
      pendingLines.push(line);
    }
    line.className = `output-line${record.cssClass ? ` ${record.cssClass}` : ''}`;
    if (record.complete) line.dataset.lineId = String(record.id);
    else delete line.dataset.lineId;
    line.replaceChildren();
    for (const fragment of record.fragments) appendFragment(line, fragment);
  };
  const clearDom = () => {
    pendingLines.length = 0;
    lineElements.clear();
    output.replaceChildren();
    announcer.textContent = '';
    announceText = '';
    navigationLocked = false;
    targetLine?.classList.remove('output-line-mention-target');
    targetLine = null;
  };
  const handleModelEvent = (event) => {
    if (disposed) return;
    if (event.type === 'reset') {
      clearDom();
      for (const record of event.records) renderRecord(record);
      scheduleRender();
    } else if (event.type === 'upsert') {
      renderRecord(event.record);
      scheduleRender();
    } else if (event.type === 'remove') {
      const line = lineElements.get(event.id);
      const pendingIndex = pendingLines.indexOf(line);
      if (pendingIndex >= 0) pendingLines.splice(pendingIndex, 1);
      line?.remove();
      lineElements.delete(event.id);
    } else if (event.type === 'clear') {
      clearDom();
    } else if (event.type === 'announce') {
      announce(event.text);
    }
  };
  const unsubscribe = model.subscribe(handleModelEvent);
  const clear = () => {
    if (!disposed) model.clear();
  };
  const returnToLive = () => {
    if (disposed) return false;
    const changed = paused || navigationLocked || targetLine !== null || !isAtBottom();
    targetLine?.classList.remove('output-line-mention-target');
    targetLine = null;
    navigationLocked = false;
    paused = false;
    syncControls();
    renderPending();
    output.scrollTop = output.scrollHeight;
    return changed;
  };
  const pause = () => {
    paused = true;
    syncControls();
  };
  const onScroll = () => {
    if (!disposed && !navigationLocked) paused = !isAtBottom();
    syncControls();
  };
  const onPauseClick = () => (paused ? returnToLive() : pause());

  pauseButton.addEventListener('click', onPauseClick);
  liveButton.addEventListener('click', returnToLive);
  clearButton.addEventListener('click', clear);
  output.addEventListener('scroll', onScroll);
  syncControls();

  return {
    appendOutput: model.appendOutput,
    appendSystemMessage: model.appendSystemMessage,
    clear,
    focus: () => output.focus({ preventScroll: true }),
    isLineAvailable: (id) => Number.isSafeInteger(id) && lineElements.has(id),
    navigateToLine: (id) => {
      if (disposed || !Number.isSafeInteger(id)) return false;
      const line = lineElements.get(id);
      if (!line || line.dataset.lineId === undefined) return false;
      renderPending();
      targetLine?.classList.remove('output-line-mention-target');
      targetLine = line;
      targetLine.classList.add('output-line-mention-target');
      navigationLocked = true;
      paused = true;
      syncControls();
      const lineTop =
        line.getBoundingClientRect().top - output.getBoundingClientRect().top + output.scrollTop;
      output.scrollTop = Math.max(0, lineTop - Math.round(output.clientHeight * 0.35));
      return true;
    },
    returnToLive,
    snapshot: () => ({ buffer: output.textContent ?? '', scrollTop: output.scrollTop }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (announceTimer) window.clearTimeout(announceTimer);
      pauseButton.removeEventListener('click', onPauseClick);
      liveButton.removeEventListener('click', returnToLive);
      clearButton.removeEventListener('click', clear);
      output.removeEventListener('scroll', onScroll);
      clearDom();
      ownedModel?.dispose();
    },
  };
}
