import type { SaltAst, SaltWidget } from '../../ast/salt.js';

const WRAPPER = /^@(start|end)\w+/i;

// `[X]` checkbox (case-insensitive on X). Anything else inside `[...]` is a
// button label.
const CHECKBOX_RE = /^\[([xX]?)\]$/;
const BUTTON_RE = /^\[([^\]]+)\]$/;

// `()` empty radio, `(X)` checked (case-insensitive on X). Only `X` or empty
// allowed between the parens — `(foo)` is NOT a radio (treated as plain text).
const RADIO_RE = /^\(([xX]?)\)$/;

const TEXTFIELD_RE = /^"(.*)"$/;
const DROPLIST_RE = /^\^(.*)\^$/;

/**
 * Minimal PlantUML Salt (wireframe) parser. Each non-empty line between the
 * outer `{` / `}` becomes one widget rendered on its own row. The outer
 * braces themselves are skipped — they only delimit the container.
 */
export function parseSalt(source: string): SaltAst {
  const rows: SaltWidget[] = [];
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (WRAPPER.test(line)) continue;
    if (line === '{' || line === '}') continue;

    const widget = classifyLine(line);
    rows.push(widget);
  }
  return { kind: 'salt', rows };
}

function classifyLine(line: string): SaltWidget {
  // Checkbox: `[]` or `[X]` — checked when the content is exactly `X`/`x`.
  const cb = CHECKBOX_RE.exec(line);
  if (cb) return { kind: 'checkbox', checked: cb[1]!.length === 1 };

  // Button: `[label]` where label is non-empty and not a single-char `X`.
  const btn = BUTTON_RE.exec(line);
  if (btn) return { kind: 'button', label: btn[1]! };

  // Radio: `()` or `(X)`.
  const r = RADIO_RE.exec(line);
  if (r) return { kind: 'radio', checked: r[1]!.length === 1 };

  // Text input: `"text"`.
  const tf = TEXTFIELD_RE.exec(line);
  if (tf) return { kind: 'textfield', text: tf[1]! };

  // Droplist: `^label^`.
  const dl = DROPLIST_RE.exec(line);
  if (dl) return { kind: 'droplist', label: dl[1]! };

  // Everything else is plain text.
  return { kind: 'text', text: line };
}
