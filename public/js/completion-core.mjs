export function tokenizeInput(line) {
  const tokens = [];
  const text = String(line || '');
  let index = 0;

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) index++;
    if (index >= text.length) break;

    const start = index;
    let value = '';
    let quote = null;
    while (index < text.length) {
      const ch = text[index];
      if (quote) {
        if (ch === '\\' && index + 1 < text.length) {
          value += text[index + 1];
          index += 2;
        } else if (ch === quote) {
          quote = null;
          index++;
        } else {
          value += ch;
          index++;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        index++;
      } else if (/\s/.test(ch)) {
        break;
      } else if (ch === '\\' && index + 1 < text.length) {
        value += text[index + 1];
        index += 2;
      } else {
        value += ch;
        index++;
      }
    }
    tokens.push({ value, start, end: index, lower: value.toLowerCase() });
  }
  return tokens;
}

function signatureFor(line, cursor) {
  return `${line}\n${cursor}`;
}

function formatMatches(matches) {
  const width = matches.reduce((max, match) => Math.max(max, match.length), 0) + 2;
  const columns = Math.max(1, Math.floor(80 / Math.max(width, 1)));
  const lines = [];
  for (let index = 0; index < matches.length; index += columns) {
    lines.push(matches.slice(index, index + columns).map((match) => match.padEnd(width, ' ')).join('').trimEnd());
  }
  return lines.join('\n');
}

function findTokenAtCursor(tokens, cursor) {
  return tokens.find((token) => cursor > token.start && cursor <= token.end) ?? null;
}

function buildHistoryCompletion(line, cursor, history) {
  const tokens = tokenizeInput(line);
  const active = findTokenAtCursor(tokens, cursor);
  if (tokens.length < 2 || !active || tokens.indexOf(active) === 0) return null;

  const partial = line.slice(active.start, cursor);
  const suffix = line.slice(cursor, active.end);
  if (!partial || /\s/.test(partial)) return null;

  const activeIndex = tokens.indexOf(active);
  for (let index = history.length - 1; index >= 0; index--) {
    const previousLine = typeof history[index] === 'string' ? history[index] : '';
    if (!previousLine || previousLine === line) continue;
    const previousTokens = tokenizeInput(previousLine);
    const candidate = previousTokens[activeIndex];
    if (
      !candidate ||
      previousTokens[0]?.lower !== tokens[0]?.lower ||
      !candidate.value.toLowerCase().startsWith(partial.toLowerCase()) ||
      candidate.value === partial + suffix
    ) continue;
    return {
      line: line.slice(0, active.start) + candidate.value + line.slice(active.end),
      cursor: active.start + candidate.value.length,
    };
  }
  return null;
}

function commonPrefix(values) {
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    let offset = 0;
    while (offset < prefix.length && offset < value.length && prefix[offset].toLowerCase() === value[offset].toLowerCase()) offset++;
    prefix = prefix.slice(0, offset);
  }
  return prefix;
}

function buildAliasCompletion(line, cursor, aliases, repeated) {
  const beforeCursor = line.slice(0, cursor);
  const indent = beforeCursor.match(/^\s*/)?.[0] ?? '';
  const partial = beforeCursor.slice(indent.length);
  if (!partial || /\s$/.test(partial) || /["']/.test(partial)) return null;

  const matches = aliases.filter((alias) => alias.toLowerCase().startsWith(partial.toLowerCase()));
  if (!matches.length) return null;
  const exact = matches.find((alias) => alias.toLowerCase() === partial.toLowerCase());
  const replacement = exact ?? (matches.length === 1 ? matches[0] : commonPrefix(matches));
  const nextLine = replacement.length > partial.length
    ? indent + replacement + line.slice(cursor)
    : line;
  const nextCursor = replacement.length > partial.length ? indent.length + replacement.length : cursor;
  return {
    line: nextLine,
    cursor: nextCursor,
    matches,
    ambiguous: matches.length > 1,
    showMatches: repeated && matches.length > 1 && nextLine === line,
  };
}

/** One DOM input's local-first completion state. */
export function createCompletionController({
  input,
  getHistory,
  getAliases,
  aliasEnabled = () => true,
  historyEnabled = () => true,
  request,
  subscribe,
  appendSystemMessage,
}) {
  let pending = null;
  let lastAmbiguousSignature = null;
  let applying = false;
  const apply = (line, cursor) => {
    applying = true;
    input.value = line;
    input.setSelectionRange(cursor, cursor);
    applying = false;
  };
  const reset = () => {
    pending = null;
    lastAmbiguousSignature = null;
  };
  const onInput = () => {
    if (!applying) reset();
  };
  const unsubscribe = subscribe((result) => {
    if (
      !pending ||
      typeof result?.line !== 'string' ||
      !Number.isInteger(result.cursor) ||
      !Array.isArray(result.matches) ||
      !result.matches.every((match) => typeof match === 'string') ||
      typeof result.ambiguous !== 'boolean' ||
      input.value !== pending.line ||
      input.selectionStart !== pending.cursor
    ) return;
    const current = pending;
    pending = null;
    apply(result.line, result.cursor);
    if (result.ambiguous && result.matches.length > 1) {
      lastAmbiguousSignature = signatureFor(result.line, result.cursor);
      if (current.repeated) appendSystemMessage(formatMatches(result.matches));
    } else {
      lastAmbiguousSignature = null;
    }
  });
  input.addEventListener('input', onInput);

  return {
    request() {
      const line = input.value;
      const cursor = input.selectionStart ?? line.length;
      const signature = signatureFor(line, cursor);
      if (aliasEnabled()) {
        const completion = buildAliasCompletion(line, cursor, getAliases(), signature === lastAmbiguousSignature);
        if (completion) {
          pending = null;
          apply(completion.line, completion.cursor);
          lastAmbiguousSignature = completion.ambiguous ? signatureFor(completion.line, completion.cursor) : null;
          if (completion.showMatches) appendSystemMessage(formatMatches(completion.matches));
          return;
        }
      }
      if (historyEnabled()) {
        const completion = buildHistoryCompletion(line, cursor, getHistory());
        if (completion) {
          pending = null;
          lastAmbiguousSignature = null;
          apply(completion.line, completion.cursor);
          return;
        }
      }
      pending = { line, cursor, repeated: signature === lastAmbiguousSignature };
      request({ line, cursor });
    },
    reset,
    dispose() {
      reset();
      unsubscribe();
      input.removeEventListener('input', onInput);
    },
  };
}
