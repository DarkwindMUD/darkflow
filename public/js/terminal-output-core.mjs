import { parseAnsi, styleToElement } from './ansi.js';

const SCREEN_READER_DELAY_MS = 180;

/**
 * One DOM-owned terminal output instance. It deliberately owns no session or
 * transport state: callers provide text and own the subscription lifecycle.
 */
export function createTerminalOutputCore({
  shell,
  output,
  pauseButton,
  liveButton,
  clearButton,
  announcer,
  processLine,
  onOutputLine,
  onClear,
}) {
  const lines = [];
  const lineElements = new Map();
  let activeLine = null;
  let activeText = '';
  let activeFragments = [];
  let animationFrame = 0;
  let announceTimer = 0;
  let disposed = false;
  let paused = false;
  let navigationLocked = false;
  let targetLine = null;
  let nextLineId = 1;
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
    if (lines.length) {
      const fragment = document.createDocumentFragment();
      fragment.append(...lines.splice(0));
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
  const createLine = (cssClass) => {
    const line = document.createElement('div');
    line.className = `output-line${cssClass ? ` ${cssClass}` : ''}`;
    lines.push(line);
    return line;
  };
  const appendFragment = (line, text, style, href) => {
    if (!text) return;
    const rendered = styleToElement(text, style);
    if (!rendered) return;
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(rendered);
      line.append(link);
    } else {
      line.append(rendered);
    }
  };
  const completeLine = () => {
    const line = activeLine;
    const text = activeText.replace(/\r/g, '');
    const fragments = activeFragments.map((fragment) => ({
      ...fragment,
      text: fragment.text.replace(/\r/g, ''),
    }));
    activeLine = null;
    activeText = '';
    activeFragments = [];
    if (!line || typeof processLine !== 'function') return;
    const result = processLine(text, fragments);
    if (result.gag) {
      const pendingIndex = lines.indexOf(line);
      if (pendingIndex >= 0) lines.splice(pendingIndex, 1);
      line.remove();
      return;
    }
    line.replaceChildren();
    for (const fragment of result.fragments) {
      appendFragment(line, fragment.text, fragment.style, fragment.href);
    }
    const renderedText = result.fragments.map((fragment) => fragment.text).join('');
    const id = nextLineId++;
    line.dataset.lineId = String(id);
    lineElements.set(id, line);
    if (typeof onOutputLine === 'function') onOutputLine({ id, text: renderedText });
  };
  const appendOutput = (text, cssClass = '') => {
    if (disposed || !text) return;
    for (const fragment of parseAnsi(text)) {
      const pieces = fragment.text.split('\n');
      for (const [index, piece] of pieces.entries()) {
        activeLine ??= createLine(cssClass);
        appendFragment(activeLine, piece, fragment.style, fragment.href);
        activeText += piece;
        if (piece) activeFragments.push({ ...fragment, text: piece });
        if (index < pieces.length - 1) completeLine();
      }
    }
    announce(text.replace(/\x1b\[[^m]*m/g, ''));
    scheduleRender();
  };
  const clearState = () => {
    lines.length = 0;
    lineElements.clear();
    activeLine = null;
    activeText = '';
    activeFragments = [];
    output.replaceChildren();
    announcer.textContent = '';
    announceText = '';
    nextLineId = 1;
    navigationLocked = false;
    targetLine?.classList.remove('output-line-mention-target');
    targetLine = null;
  };
  const clear = () => {
    if (disposed) return;
    clearState();
    if (typeof onClear === 'function') onClear();
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
    appendOutput,
    appendSystemMessage: (text) => appendOutput(text, 'system-line'),
    clear,
    focus: () => output.focus({ preventScroll: true }),
    isLineAvailable: (id) => Number.isSafeInteger(id) && lineElements.has(id),
    navigateToLine: (id) => {
      if (disposed || !Number.isSafeInteger(id)) return false;
      const line = lineElements.get(id);
      if (!line) return false;
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
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (announceTimer) window.clearTimeout(announceTimer);
      pauseButton.removeEventListener('click', onPauseClick);
      liveButton.removeEventListener('click', returnToLive);
      clearButton.removeEventListener('click', clear);
      output.removeEventListener('scroll', onScroll);
      clearState();
      if (typeof onClear === 'function') onClear();
    },
  };
}
