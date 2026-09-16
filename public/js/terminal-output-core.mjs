import { styleToElement } from './ansi.js';
import { OUTPUT_OVERSCAN_LINES } from './constants.js';
import { createTerminalOutputModel } from './terminal-output-model.mjs';

const SCREEN_READER_DELAY_MS = 180;
const BOTTOM_THRESHOLD = 5;
const USER_SCROLL_INTENT_MS = 900;
const ESTIMATED_LINE_HEIGHT = 20;

/** One DOM-owned, viewport-rendered terminal output model. */
export function createTerminalOutputCore({
  shell, output, historyOutput, divider, pauseButton, liveButton, clearButton,
  announcer, subscribeOutput, clearOutput, processLine, onOutputLine, onClear,
  onSplitRatioChange,
}) {
  const ownedModel = subscribeOutput
    ? null
    : createTerminalOutputModel({ processLine, onOutputLine, onClear });
  const model = ownedModel ?? { subscribe: subscribeOutput, clear: clearOutput };
  const records = new Map();
  const dirtyIds = new Set();
  let animationFrame = 0;
  let announceTimer = 0;
  let disposed = false;
  let paused = false;
  let navigationLocked = false;
  let targetLine = null;
  let announceText = '';
  let screenReaderMode = false;
  let behavior = 'pause';
  let splitActive = false;
  let splitRatio = 0.6;
  let userScrollIntentUntil = 0;
  let dividerPointerId = null;

  const createPane = (host) => {
    if (!host) return null;
    const pane = {
      host,
      top: document.createElement('div'),
      viewport: document.createElement('div'),
      bottom: document.createElement('div'),
      nodes: new Map(), heights: new Map(), rendered: [], prefix: [0], anchor: null,
      layoutInvalidated: true,
    };
    pane.top.className = 'terminal-output-spacer';
    pane.viewport.className = 'terminal-output-viewport';
    pane.bottom.className = 'terminal-output-spacer';
    host.replaceChildren(pane.top, pane.viewport, pane.bottom);
    return pane;
  };
  const mainPane = createPane(output);
  const historyPane = createPane(historyOutput);
  const isAtBottom = (element) =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - BOTTOM_THRESHOLD;
  const isSplitMode = () => behavior === 'split' && historyPane;
  const clampSplitRatio = (value) => {
    const ratio = Number(value);
    return Number.isFinite(ratio) ? Math.max(0.2, Math.min(0.8, ratio)) : 0.6;
  };
  const syncControls = () => {
    shell.classList.toggle('paused', paused);
    shell.classList.toggle('split-active', splitActive);
    shell.style.setProperty('--output-split-ratio', `${splitRatio * 100}%`);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.title = paused ? 'Resume live terminal' : 'Pause live terminal';
    liveButton.title = splitActive ? 'Return to live terminal' : 'Live terminal';
  };
  const scheduleRender = () => {
    if (animationFrame || disposed) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      render();
    });
  };
  const announce = (text) => {
    if (!screenReaderMode) return;
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
    } else line.append(rendered);
  };
  const patchLine = (line, record) => {
    line.className = `output-line${record.cssClass ? ` ${record.cssClass}` : ''}`;
    if (record.complete) line.dataset.lineId = String(record.id);
    else delete line.dataset.lineId;
    line.replaceChildren();
    for (const fragment of record.fragments) appendFragment(line, fragment);
  };
  const captureAnchor = (pane) => {
    if (!pane || !pane.rendered.length || isAtBottom(pane.host)) return null;
    const top = pane.host.scrollTop;
    let index = 0;
    while (index + 1 < pane.prefix.length && pane.prefix[index + 1] <= top) index += 1;
    return { id: pane.rendered[index], offset: top - pane.prefix[index] };
  };
  const captureReadingAnchors = () => {
    for (const pane of [mainPane, historyPane]) {
      if (pane && !pane.anchor) pane.anchor = captureAnchor(pane);
    }
  };
  const prefixFor = (pane, ordered) => {
    const prefix = new Array(ordered.length + 1);
    prefix[0] = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      prefix[index + 1] = prefix[index] + (pane.heights.get(ordered[index].id) ?? ESTIMATED_LINE_HEIGHT);
    }
    return prefix;
  };
  const findIndex = (prefix, offset) => {
    let low = 0;
    let high = prefix.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (prefix[mid + 1] <= offset) low = mid + 1;
      else high = mid;
    }
    return Math.min(low, Math.max(0, prefix.length - 2));
  };
  const releasePane = (pane) => {
    if (!pane) return;
    pane.nodes.clear();
    pane.heights.clear();
    pane.rendered = [];
    pane.prefix = [0];
    pane.anchor = null;
    pane.layoutInvalidated = true;
    pane.host.replaceChildren();
  };
  const ensurePane = (pane) => {
    if (pane.host.firstChild === pane.top) return;
    pane.host.replaceChildren(pane.top, pane.viewport, pane.bottom);
  };
  const renderPane = (pane, ordered, stickToBottom) => {
    if (!pane) return;
    ensurePane(pane);
    const previousAnchor = pane.anchor;
    pane.anchor = null;
    let prefix = prefixFor(pane, ordered);
    const viewportHeight = pane.host.clientHeight || 0;
    const scrollTop = stickToBottom
      ? Math.max(0, prefix[prefix.length - 1] - viewportHeight)
      : pane.host.scrollTop;
    const visibleStart = findIndex(prefix, scrollTop);
    let visibleEnd = findIndex(prefix, scrollTop + viewportHeight) + 1;
    if (!ordered.length) visibleEnd = 0;
    const start = Math.max(0, visibleStart - OUTPUT_OVERSCAN_LINES);
    const end = Math.min(ordered.length, visibleEnd + OUTPUT_OVERSCAN_LINES);
    const ids = new Set();
    const nodes = [];
    for (let index = start; index < end; index += 1) {
      const record = ordered[index];
      ids.add(record.id);
      let line = pane.nodes.get(record.id);
      if (!line) {
        line = document.createElement('div');
        pane.nodes.set(record.id, line);
        patchLine(line, record);
      } else if (dirtyIds.has(record.id)) patchLine(line, record);
      nodes.push(line);
    }
    for (const [id, line] of pane.nodes) {
      if (!ids.has(id)) {
        line.remove();
        pane.nodes.delete(id);
      }
    }
    pane.top.style.height = `${prefix[start]}px`;
    pane.bottom.style.height = `${Math.max(0, prefix[prefix.length - 1] - prefix[end])}px`;
    for (let index = 0; index < nodes.length; index += 1) {
      const current = pane.viewport.children[index];
      if (current !== nodes[index]) pane.viewport.insertBefore(nodes[index], current ?? null);
    }
    let heightsChanged = false;
    for (let index = 0; index < nodes.length; index += 1) {
      const id = ordered[start + index].id;
      if (!pane.layoutInvalidated && !dirtyIds.has(id) && pane.heights.has(id)) continue;
      const measured = Math.ceil(nodes[index].getBoundingClientRect().height);
      if (measured > 0 && pane.heights.get(id) !== measured) {
        pane.heights.set(id, measured);
        heightsChanged = true;
      }
    }
    pane.layoutInvalidated = false;
    if (heightsChanged) {
      prefix = prefixFor(pane, ordered);
      pane.top.style.height = `${prefix[start]}px`;
      pane.bottom.style.height = `${Math.max(0, prefix[prefix.length - 1] - prefix[end])}px`;
    }
    pane.rendered = ordered.map((record) => record.id);
    pane.prefix = prefix;
    const anchorIndex = previousAnchor ? pane.rendered.indexOf(previousAnchor.id) : -1;
    if (stickToBottom) pane.host.scrollTop = Math.max(0, pane.host.scrollHeight - pane.host.clientHeight);
    else if (anchorIndex >= 0) pane.host.scrollTop = Math.max(0, prefix[anchorIndex] + previousAnchor.offset);
  };
  const render = () => {
    if (disposed) return;
    const ordered = [...records.values()];
    renderPane(mainPane, ordered, splitActive || !paused);
    if (splitActive) renderPane(historyPane, ordered, false);
    else releasePane(historyPane);
    dirtyIds.clear();
  };
  const clearDom = () => {
    records.clear();
    dirtyIds.clear();
    releasePane(mainPane);
    releasePane(historyPane);
    announcer.textContent = '';
    announceText = '';
    navigationLocked = false;
    targetLine?.classList.remove('output-line-mention-target');
    targetLine = null;
  };
  const handleModelEvent = (event) => {
    if (disposed) return;
    if (event.type === 'reset') {
      records.clear();
      for (const record of event.records) records.set(record.id, record);
      dirtyIds.clear();
      event.records.forEach((record) => dirtyIds.add(record.id));
      scheduleRender();
    } else if (event.type === 'upsert') {
      captureReadingAnchors();
      records.set(event.record.id, event.record);
      dirtyIds.add(event.record.id);
      scheduleRender();
    } else if (event.type === 'remove') {
      captureReadingAnchors();
      records.delete(event.id);
      dirtyIds.delete(event.id);
      scheduleRender();
    } else if (event.type === 'clear') clearDom();
    else if (event.type === 'announce') announce(event.text);
  };
  const unsubscribe = model.subscribe(handleModelEvent);
  const clear = () => { if (!disposed) model.clear(); };
  const deactivateSplit = () => {
    if (!splitActive) return;
    splitActive = false;
    userScrollIntentUntil = 0;
    syncControls();
    releasePane(historyPane);
    renderPane(mainPane, [...records.values()], true);
  };
  const activateSplit = () => {
    if (splitActive || !isSplitMode()) return;
    const anchor = captureAnchor(mainPane);
    splitActive = true;
    paused = false;
    historyPane.anchor = anchor;
    syncControls();
    render();
  };
  const returnToLive = () => {
    if (disposed) return false;
    if (splitActive) {
      deactivateSplit();
      return true;
    }
    const changed = paused || navigationLocked || targetLine !== null || !isAtBottom(output);
    targetLine?.classList.remove('output-line-mention-target');
    targetLine = null;
    navigationLocked = false;
    paused = false;
    userScrollIntentUntil = 0;
    syncControls();
    renderPane(mainPane, [...records.values()], true);
    return changed;
  };
  const markUserScrollIntent = () => { userScrollIntentUntil = Date.now() + USER_SCROLL_INTENT_MS; };
  const scrollByPage = (direction) => {
    if (disposed) return;
    markUserScrollIntent();
    const target = splitActive ? historyOutput : output;
    target.scrollTop += target.clientHeight * direction;
    if (splitActive) onHistoryScroll();
    else onScroll();
  };
  const pause = () => {
    if (splitActive) deactivateSplit();
    else { paused = true; syncControls(); }
  };
  const onScroll = () => {
    if (disposed || navigationLocked) return;
    if (splitActive) { renderPane(mainPane, [...records.values()], true); return; }
    if (isSplitMode()) {
      if (!isAtBottom(output) && Date.now() <= userScrollIntentUntil) activateSplit();
      else scheduleRender();
      return;
    }
    if (isAtBottom(output)) { paused = false; syncControls(); }
    else if (Date.now() <= userScrollIntentUntil) { paused = true; syncControls(); }
    mainPane.anchor = captureAnchor(mainPane);
    scheduleRender();
  };
  const onHistoryScroll = () => {
    if (!disposed && splitActive) {
      if (isAtBottom(historyOutput)) deactivateSplit();
      else { historyPane.anchor = captureAnchor(historyPane); scheduleRender(); }
    }
  };
  const markScrollbarPointerIntent = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const scrollbarWidth = Math.max(0, target.offsetWidth - target.clientWidth);
    if (event.clientX >= rect.right - Math.max(16, scrollbarWidth + 4)) markUserScrollIntent();
  };
  const onPauseClick = () => (paused || splitActive ? returnToLive() : pause());
  const onDividerDown = (event) => {
    dividerPointerId = event.pointerId;
    divider?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const onDividerMove = (event) => {
    if (event.pointerId !== dividerPointerId) return;
    const rect = shell.getBoundingClientRect();
    if (rect.height <= 10) return;
    splitRatio = clampSplitRatio((event.clientY - rect.top) / (rect.height - 10));
    syncControls();
    scheduleRender();
  };
  const onDividerEnd = (event) => {
    if (event.pointerId !== dividerPointerId) return;
    divider?.releasePointerCapture?.(dividerPointerId);
    dividerPointerId = null;
    onSplitRatioChange?.(splitRatio);
  };

  pauseButton.addEventListener('click', onPauseClick);
  liveButton.addEventListener('click', returnToLive);
  clearButton.addEventListener('click', clear);
  output.addEventListener('scroll', onScroll);
  output.addEventListener('wheel', markUserScrollIntent, { passive: true });
  output.addEventListener('touchstart', markUserScrollIntent, { passive: true });
  output.addEventListener('pointerdown', markScrollbarPointerIntent);
  historyOutput?.addEventListener('scroll', onHistoryScroll);
  historyOutput?.addEventListener('wheel', markUserScrollIntent, { passive: true });
  historyOutput?.addEventListener('touchstart', markUserScrollIntent, { passive: true });
  if (divider) {
    divider.addEventListener('pointerdown', onDividerDown);
    window.addEventListener('pointermove', onDividerMove);
    window.addEventListener('pointerup', onDividerEnd);
    window.addEventListener('pointercancel', onDividerEnd);
  }
  syncControls();

  return {
    appendOutput: model.appendOutput,
    appendSystemMessage: model.appendSystemMessage,
    clear,
    configure({ scrollbackBehavior, scrollbackSplitRatio, screenReaderMode: nextScreenReaderMode } = {}) {
      behavior = scrollbackBehavior === 'split' ? 'split' : 'pause';
      splitRatio = clampSplitRatio(scrollbackSplitRatio);
      screenReaderMode = nextScreenReaderMode === true;
      if (!screenReaderMode) {
        if (announceTimer) window.clearTimeout(announceTimer);
        announceTimer = 0;
        announceText = '';
        announcer.textContent = '';
      }
      if (!isSplitMode()) deactivateSplit();
      syncControls();
      scheduleRender();
    },
    focus: () => output.focus({ preventScroll: true }),
    isLineAvailable: (id) => Number.isSafeInteger(id) && records.has(id),
    navigateToLine: (id) => {
      if (disposed || !Number.isSafeInteger(id) || !records.has(id)) return false;
      const pane = splitActive ? historyPane : mainPane;
      const target = splitActive ? historyOutput : output;
      const ordered = [...records.values()];
      const index = ordered.findIndex((record) => record.id === id);
      const prefix = prefixFor(pane, ordered);
      target.scrollTop = Math.max(0, prefix[index] - Math.round(target.clientHeight * 0.35));
      renderPane(pane, ordered, false);
      targetLine?.classList.remove('output-line-mention-target');
      targetLine = pane.nodes.get(id);
      if (!targetLine) return false;
      targetLine.classList.add('output-line-mention-target');
      navigationLocked = true;
      paused = !splitActive;
      syncControls();
      const lineTop =
        targetLine.getBoundingClientRect().top - target.getBoundingClientRect().top + target.scrollTop;
      target.scrollTop = Math.max(0, lineTop - Math.round(target.clientHeight * 0.35));
      scheduleRender();
      return true;
    },
    refreshLayout: () => {
      captureReadingAnchors();
      for (const pane of [mainPane, splitActive ? historyPane : null]) {
        if (!pane) continue;
        pane.heights.clear();
        pane.layoutInvalidated = true;
      }
      scheduleRender();
    },
    returnToLive,
    scrollByPage,
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
      output.removeEventListener('wheel', markUserScrollIntent);
      output.removeEventListener('touchstart', markUserScrollIntent);
      output.removeEventListener('pointerdown', markScrollbarPointerIntent);
      historyOutput?.removeEventListener('scroll', onHistoryScroll);
      historyOutput?.removeEventListener('wheel', markUserScrollIntent);
      historyOutput?.removeEventListener('touchstart', markUserScrollIntent);
      if (divider) {
        divider.removeEventListener('pointerdown', onDividerDown);
        window.removeEventListener('pointermove', onDividerMove);
        window.removeEventListener('pointerup', onDividerEnd);
        window.removeEventListener('pointercancel', onDividerEnd);
      }
      clearDom();
      ownedModel?.dispose();
    },
  };
}
