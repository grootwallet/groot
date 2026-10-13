// Remove line and block comments while preserving quoted text and newlines.
// These release tripwires inspect declarations in TypeScript and Rust source;
// comments must never be able to satisfy or shadow a policy assertion.
export function stripSourceComments(source, { rust = false, maskStrings = false } = {}) {
  let output = '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (quote) {
      output += maskStrings && current !== '\n' ? ' ' : current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) quote = null;
      continue;
    }
    if (rust && current === 'r') {
      const raw = source.slice(index).match(/^r(#{0,255})"/);
      if (raw) {
        const delimiter = `"${raw[1]}`;
        const end = source.indexOf(delimiter, index + raw[0].length);
        const limit = end < 0 ? source.length : end + delimiter.length;
        const value = source.slice(index, limit);
        output += maskStrings ? value.replace(/[^\n]/g, ' ') : value;
        index = limit - 1;
        continue;
      }
    }
    if (current === '"' || (!rust && (current === "'" || current === '`'))) {
      quote = current;
      output += maskStrings ? ' ' : current;
      continue;
    }
    if (current === '/' && next === '/') {
      output += '  ';
      index += 2;
      while (index < source.length && source[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      if (index < source.length) output += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      output += '  ';
      index += 2;
      let depth = 1;
      while (index < source.length && depth > 0) {
        if (rust && source[index] === '/' && source[index + 1] === '*') {
          output += '  ';
          depth += 1;
          index += 2;
          continue;
        }
        if (source[index] === '*' && source[index + 1] === '/') {
          output += '  ';
          depth -= 1;
          index += 2;
          continue;
        }
        output += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      index -= 1;
      continue;
    }
    output += current;
  }
  return output;
}
