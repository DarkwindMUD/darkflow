import { createAnsiState, parseAnsi } from './ansi.js';

/**
 * Session-owned terminal text processing. Records are inserted before line
 * processing so synchronous local output cannot overtake its source line.
 */
export function createTerminalOutputModel({ processLine, onOutputLine, onClear, recordLimit = 10000 } = {}) {
  const listeners = new Set();
  const records = new Map();
  let parserState = createAnsiState();
  let activeRecord = null;
  let activeText = '';
  let activeFragments = [];
  let nextLineId = 1;
  let disposed = false;
  let maxRecords = Number.isSafeInteger(recordLimit) && recordLimit > 0 ? recordLimit : 10000;
  const processingRecordIds = new Set();

  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const updateActiveRecord = (changes = {}) => {
    if (!activeRecord) return;
    activeRecord = { ...activeRecord, fragments: [...activeFragments], ...changes };
    records.set(activeRecord.id, activeRecord);
    emit({ type: 'upsert', record: activeRecord });
  };
  const createRecord = (cssClass) => {
    pruneRecords(maxRecords - 1);
    activeRecord = {
      id: nextLineId++,
      fragments: [],
      cssClass,
      complete: false,
      text: '',
    };
    records.set(activeRecord.id, activeRecord);
    emit({ type: 'upsert', record: activeRecord });
  };
  const pruneRecords = (target = maxRecords) => {
    while (records.size > target) {
      let removedId = null;
      for (const [id, record] of records) {
        if (record !== activeRecord && !processingRecordIds.has(id)) {
          removedId = id;
          break;
        }
      }
      if (removedId === null) return;
      records.delete(removedId);
      emit({ type: 'remove', id: removedId });
    }
  };
  const completeLine = () => {
    const record = activeRecord;
    const text = activeText.replace(/\r/g, '');
    const fragments = activeFragments.map((fragment) => ({
      ...fragment,
      text: fragment.text.replace(/\r/g, ''),
    }));

    // Detach assembly state before automation; automation may append recursively.
    activeRecord = null;
    activeText = '';
    activeFragments = [];
    if (!record) return;

    processingRecordIds.add(record.id);
    const result = typeof processLine === 'function'
      ? processLine(text, fragments)
      : { fragments, gag: false };
    processingRecordIds.delete(record.id);
    if (!records.has(record.id)) return;
    if (result.gag) {
      records.delete(record.id);
      emit({ type: 'remove', id: record.id });
      return;
    }

    const completed = {
      ...record,
      complete: true,
      fragments: result.fragments,
      text: result.fragments.map((fragment) => fragment.text).join(''),
    };
    records.set(record.id, completed);
    emit({ type: 'upsert', record: completed });
    pruneRecords();
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
      records.delete(activeRecord.id);
      emit({ type: 'remove', id: activeRecord.id });
    }
    activeRecord = null;
    activeText = '';
    activeFragments = [];
    parserState = createAnsiState();
  };

  return {
    appendOutput,
    appendSystemMessage: (text) => appendOutput(text.endsWith('\n') ? text : text + '\n', 'system-line'),
    clear() {
      if (disposed) return;
      records.clear();
      activeRecord = null;
      activeText = '';
      activeFragments = [];
      parserState = createAnsiState();
      emit({ type: 'clear' });
      if (typeof onClear === 'function') onClear();
    },
    resetStream,
    setRecordLimit(limit) {
      if (disposed || !Number.isSafeInteger(limit) || limit < 1) return;
      maxRecords = limit;
      pruneRecords();
    },
    snapshot: () => [...records.values()],
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener({ type: 'reset', records: [...records.values()] });
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      records.clear();
      activeRecord = null;
      activeText = '';
      activeFragments = [];
      parserState = createAnsiState();
      listeners.clear();
    },
  };
}
