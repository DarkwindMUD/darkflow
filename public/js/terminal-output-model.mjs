import { createAnsiState, parseAnsi } from './ansi.js';

/**
 * Session-owned terminal text processing. Records are inserted before line
 * processing so synchronous local output cannot overtake its source line.
 */
export function createTerminalOutputModel({ processLine, onOutputLine, onClear } = {}) {
  const listeners = new Set();
  const records = [];
  let parserState = createAnsiState();
  let activeRecord = null;
  let activeIndex = -1;
  let activeText = '';
  let activeFragments = [];
  let nextLineId = 1;
  let disposed = false;

  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const updateActiveRecord = (changes = {}) => {
    if (!activeRecord) return;
    activeRecord = { ...activeRecord, fragments: [...activeFragments], ...changes };
    records[activeIndex] = activeRecord;
    emit({ type: 'upsert', record: activeRecord });
  };
  const createRecord = (cssClass) => {
    activeRecord = {
      id: nextLineId++,
      fragments: [],
      cssClass,
      complete: false,
      text: '',
    };
    records.push(activeRecord);
    activeIndex = records.length - 1;
    emit({ type: 'upsert', record: activeRecord });
  };
  const completeLine = () => {
    const record = activeRecord;
    const recordIndex = activeIndex;
    const text = activeText.replace(/\r/g, '');
    const fragments = activeFragments.map((fragment) => ({
      ...fragment,
      text: fragment.text.replace(/\r/g, ''),
    }));

    // Detach assembly state before automation; automation may append recursively.
    activeRecord = null;
    activeIndex = -1;
    activeText = '';
    activeFragments = [];
    if (!record) return;

    const result = typeof processLine === 'function'
      ? processLine(text, fragments)
      : { fragments, gag: false };
    if (result.gag) {
      records.splice(recordIndex, 1);
      if (activeIndex > recordIndex) activeIndex -= 1;
      emit({ type: 'remove', id: record.id });
      return;
    }

    const completed = {
      ...record,
      complete: true,
      fragments: result.fragments,
      text: result.fragments.map((fragment) => fragment.text).join(''),
    };
    records[recordIndex] = completed;
    emit({ type: 'upsert', record: completed });
    if (typeof onOutputLine === 'function') {
      onOutputLine({ id: completed.id, text: completed.text });
    }
  };
  const appendOutput = (text, cssClass = '') => {
    if (disposed || !text) return;
    for (const fragment of parseAnsi(text, parserState)) {
      const pieces = fragment.text.split('\n');
      for (const [index, piece] of pieces.entries()) {
        if (!activeRecord && !piece && index === pieces.length - 1) continue;
        if (!activeRecord) createRecord(cssClass);
        activeText += piece;
        if (piece) activeFragments.push({ ...fragment, text: piece });
        updateActiveRecord();
        if (index < pieces.length - 1) completeLine();
      }
    }
    emit({ type: 'announce', text: text.replace(/\x1b\[[^m]*m/g, '') });
  };
  const resetStream = () => {
    if (disposed) return;
    if (activeRecord) {
      records.splice(activeIndex, 1);
      emit({ type: 'remove', id: activeRecord.id });
    }
    activeRecord = null;
    activeIndex = -1;
    activeText = '';
    activeFragments = [];
    parserState = createAnsiState();
  };

  return {
    appendOutput,
    appendSystemMessage: (text) => appendOutput(text, 'system-line'),
    clear() {
      if (disposed) return;
      records.length = 0;
      activeRecord = null;
      activeIndex = -1;
      activeText = '';
      activeFragments = [];
      parserState = createAnsiState();
      emit({ type: 'clear' });
      if (typeof onClear === 'function') onClear();
    },
    resetStream,
    snapshot: () => [...records],
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener({ type: 'reset', records: [...records] });
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      records.length = 0;
      activeRecord = null;
      activeIndex = -1;
      activeText = '';
      activeFragments = [];
      parserState = createAnsiState();
      listeners.clear();
    },
  };
}
