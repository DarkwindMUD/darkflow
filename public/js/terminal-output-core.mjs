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
}) {
  const lines = [];
  let activeLine = null;
  let activeText = '';
  let activeFragments = [];
  let animationFrame = 0;
  let announceTimer = 0;
  let disposed = false;
  let paused = false;
  let announceText = '';

  const isAtBottom = () => output.scrollTop + output.clientHeight >= output.scrollHeight - 5;
  const syncControls = () => {
    shell.classList.toggle('paused', paused);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.title = paused ? 'Resume live terminal' : 'Pause live terminal';
  };
  const scheduleRender = () => {
    if (animationFrame || disposed) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      if (lines.length) {
        const fragment = document.createDocumentFragment();
        fragment.append(...lines.splice(0));
        output.append(fragment);
      }
      if (!paused) output.scrollTop = output.scrollHeight;
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
  const clear = () => {
    lines.length = 0;
    activeLine = null;
    activeText = '';
    activeFragments = [];
    output.replaceChildren();
    announcer.textContent = '';
    announceText = '';
  };
  const resume = () => {
    paused = false;
    syncControls();
    output.scrollTop = output.scrollHeight;
  };
  const pause = () => {
    paused = true;
    syncControls();
  };
  const onScroll = () => {
    if (!disposed) paused = !isAtBottom();
    syncControls();
  };
  const onPauseClick = () => (paused ? resume() : pause());

  pauseButton.addEventListener('click', onPauseClick);
  liveButton.addEventListener('click', resume);
  clearButton.addEventListener('click', clear);
  output.addEventListener('scroll', onScroll);
  syncControls();

  return {
    appendOutput,
    appendSystemMessage: (text) => appendOutput(text, 'system-line'),
    clear,
    focus: () => output.focus({ preventScroll: true }),
    snapshot: () => ({ buffer: output.textContent ?? '', scrollTop: output.scrollTop }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (announceTimer) window.clearTimeout(announceTimer);
      pauseButton.removeEventListener('click', onPauseClick);
      liveButton.removeEventListener('click', resume);
      clearButton.removeEventListener('click', clear);
      output.removeEventListener('scroll', onScroll);
      clear();
    },
  };
}
