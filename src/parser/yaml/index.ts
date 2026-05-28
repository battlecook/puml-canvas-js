import type { YamlAst } from '../../ast/yaml.js';

const WRAPPER = /^@(start|end)\w+/i;
const TITLE = /^title\s+(.+)\s*$/i;
const HIGHLIGHT = /^#highlight\b/i;
const QUOTED_SEGMENT = /"([^"]+)"/g;

interface PreLine {
  text: string;
  indent: number;
  content: string;
}

interface State {
  lines: PreLine[];
  pos: number;
  anchors: Map<string, unknown>;
}

export function parseYaml(source: string): YamlAst {
  const rawLines = source.split(/\r\n|\r|\n/);
  const { lines: afterStyle, styles } = extractStyleBlocks(rawLines);
  const highlights: string[][] = [];
  const bodyLines: string[] = [];
  let title = '';

  for (const raw of afterStyle) {
    const t = raw.trim();
    if (WRAPPER.test(t)) continue;
    if (HIGHLIGHT.test(t)) {
      const path = parseHighlightPath(t);
      if (path.length > 0) highlights.push(path);
      continue;
    }
    const tm = TITLE.exec(t);
    if (tm) {
      title = tm[1]!.trim();
      continue;
    }
    bodyLines.push(raw);
  }

  let data: unknown = null;
  let parseError = '';
  try {
    const pre = preprocess(bodyLines);
    if (pre.length === 0) {
      data = null;
    } else {
      const state: State = { lines: pre, pos: 0, anchors: new Map() };
      data = parseValueBlock(state, pre[0]!.indent);
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  const ast: YamlAst = { kind: 'yaml', title, data, highlights, parseError };
  if (Object.keys(styles).length > 0) ast.styles = styles;
  return ast;
}

/**
 * Pre-pass: strips `<style> ... </style>` blocks and collects nested
 * selector/property declarations into a flat dotted-key map (all lowercase).
 *
 * Grammar (minimal subset):
 *
 *   <style>
 *     sel1 {
 *       Prop Value
 *       sel2 {           // nested selectors allowed
 *         Prop Value
 *       }
 *     }
 *   </style>
 *
 * Last write wins for duplicate paths (matches PlantUML's documented behavior
 * for repeated property declarations within the same selector).
 */
function extractStyleBlocks(
  rawLines: string[],
): { lines: string[]; styles: Record<string, string> } {
  const out: string[] = [];
  const styles: Record<string, string> = {};
  let inStyleBlock = false;
  const selStack: string[] = [];

  for (const raw of rawLines) {
    const text = raw.trim();

    if (!inStyleBlock) {
      if (/^<style>\s*$/i.test(text)) {
        inStyleBlock = true;
        selStack.length = 0;
        continue;
      }
      out.push(raw);
      continue;
    }

    if (/^<\/style>\s*$/i.test(text)) {
      inStyleBlock = false;
      selStack.length = 0;
      continue;
    }
    if (!text) continue;

    // Close brace pops a selector frame.
    if (text === '}' || /^\}\s*$/.test(text)) {
      selStack.pop();
      continue;
    }

    // Selector opener: `name {` (open block) or `name` (open block, no brace).
    const open = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*$/.exec(text);
    if (open) {
      selStack.push(open[1]!.toLowerCase());
      continue;
    }

    // Property line: `Property Value` (also accepts trailing `}` for one-line form).
    const oneLineClose = /^(\S+)\s+(.+?)\s*\}\s*$/.exec(text);
    if (oneLineClose && selStack.length > 0) {
      const path = [...selStack, oneLineClose[1]!.toLowerCase()].join('.');
      styles[path] = oneLineClose[2]!.trim();
      selStack.pop();
      continue;
    }
    const prop = /^(\S+)\s+(.+)$/.exec(text);
    if (prop && selStack.length > 0) {
      const path = [...selStack, prop[1]!.toLowerCase()].join('.');
      styles[path] = prop[2]!.trim();
    }
  }

  return { lines: out, styles };
}

function parseHighlightPath(text: string): string[] {
  const body = text.replace(/^#highlight\s*/i, '');
  const segments: string[] = [];
  QUOTED_SEGMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_SEGMENT.exec(body)) !== null) {
    segments.push(m[1]!);
  }
  return segments;
}

function preprocess(lines: string[]): PreLine[] {
  const out: PreLine[] = [];
  for (const raw of lines) {
    const stripped = stripComment(raw);
    const content = stripped.replace(/\s+$/, '');
    if (content.trim() === '') continue;
    const indent = leadingSpaces(content);
    out.push({ text: content, indent, content: content.slice(indent) });
  }
  return out;
}

function stripComment(line: string): string {
  let inQ: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '\\' && inQ === '"') { i++; continue; }
      if (c === inQ) inQ = null;
    } else {
      if (c === '"' || c === "'") inQ = c;
      else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]!))) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
}

function parseValueBlock(state: State, minIndent: number): unknown {
  const line = state.lines[state.pos];
  if (!line || line.indent < minIndent) return null;
  if (isSequenceStart(line.content)) {
    return parseSequenceBlock(state, line.indent);
  }
  return parseMappingBlock(state, line.indent);
}

function isSequenceStart(content: string): boolean {
  return content === '-' || content.startsWith('- ');
}

function parseMappingBlock(state: State, indent: number): unknown {
  const result: Record<string, unknown> = {};
  let mergeSources: Record<string, unknown>[] = [];
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos]!;
    if (line.indent !== indent) break;
    if (isSequenceStart(line.content)) break;
    const entry = parseMapEntry(state, line, indent);
    if (entry.key === '<<') {
      const v = entry.value;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (isPlainObject(item)) mergeSources.push(item as Record<string, unknown>);
        }
      } else if (isPlainObject(v)) {
        mergeSources.push(v as Record<string, unknown>);
      }
    } else {
      result[entry.key] = entry.value;
    }
  }
  if (mergeSources.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const src of mergeSources) {
      for (const [k, v] of Object.entries(src)) {
        if (!(k in merged)) merged[k] = v;
      }
    }
    for (const [k, v] of Object.entries(result)) merged[k] = v;
    return merged;
  }
  return result;
}

function parseMapEntry(
  state: State,
  line: PreLine,
  indent: number,
): { key: string; value: unknown } {
  const colonIdx = findMapColon(line.content);
  if (colonIdx === -1) {
    throw new Error(`expected 'key: value' at line starting with: ${line.content}`);
  }
  const keyRaw = line.content.slice(0, colonIdx).trim();
  const rest = line.content.slice(colonIdx + 1).trim();
  const key = unquoteKey(keyRaw);
  state.pos++;

  if (rest === '') {
    if (state.pos < state.lines.length) {
      const next = state.lines[state.pos]!;
      if (next.indent > indent) {
        const value = parseValueBlock(state, next.indent);
        return { key, value };
      }
    }
    return { key, value: null };
  }

  const value = parseInlineValue(state, rest, indent);
  return { key, value };
}

function parseSequenceBlock(state: State, indent: number): unknown {
  const arr: unknown[] = [];
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos]!;
    if (line.indent !== indent) break;
    if (!isSequenceStart(line.content)) break;
    const after = line.content === '-' ? '' : line.content.slice(2).trim();
    state.pos++;

    if (after === '') {
      const value = parseValueBlock(state, indent + 1);
      arr.push(value);
      continue;
    }

    const colonIdx = findMapColon(after);
    if (colonIdx !== -1) {
      const k = unquoteKey(after.slice(0, colonIdx).trim());
      const v = after.slice(colonIdx + 1).trim();
      const mapItem: Record<string, unknown> = {};
      const itemIndent = indent + 2;
      if (v === '') {
        const nv = readDeeperBlock(state, itemIndent);
        mapItem[k] = nv;
      } else {
        mapItem[k] = parseInlineValue(state, v, itemIndent);
      }
      while (state.pos < state.lines.length) {
        const nl = state.lines[state.pos]!;
        if (nl.indent !== itemIndent) break;
        if (isSequenceStart(nl.content)) break;
        const entry = parseMapEntry(state, nl, itemIndent);
        if (entry.key !== '<<') mapItem[entry.key] = entry.value;
      }
      arr.push(mapItem);
      continue;
    }

    arr.push(parseInlineValue(state, after, indent));
  }
  return arr;
}

function readDeeperBlock(state: State, parentIndent: number): unknown {
  if (state.pos >= state.lines.length) return null;
  const next = state.lines[state.pos]!;
  if (next.indent <= parentIndent) return null;
  return parseValueBlock(state, next.indent);
}

function parseInlineValue(state: State, text: string, currentIndent: number): unknown {
  let t = text.trim();
  let anchorName: string | undefined;

  if (t.startsWith('&')) {
    const m = /^&(\S+)\s*(.*)$/.exec(t);
    if (m) {
      anchorName = m[1]!;
      t = (m[2] ?? '').trim();
    }
  }

  let value: unknown;
  if (t === '') {
    if (state.pos < state.lines.length) {
      const next = state.lines[state.pos]!;
      if (next.indent > currentIndent) {
        value = parseValueBlock(state, next.indent);
      } else {
        value = null;
      }
    } else {
      value = null;
    }
  } else if (t.startsWith('*')) {
    const name = t.slice(1).trim();
    value = state.anchors.has(name)
      ? state.anchors.get(name)
      : `*${name}`;
  } else if (t.startsWith('[')) {
    value = parseFlow(t).value;
  } else if (t.startsWith('{')) {
    value = parseFlow(t).value;
  } else if (t.startsWith('|') || t.startsWith('>')) {
    value = readBlockScalar(state, currentIndent, t[0] as '|' | '>');
  } else {
    value = parseScalar(t);
  }

  if (anchorName !== undefined) state.anchors.set(anchorName, value);
  return value;
}

function readBlockScalar(state: State, parentIndent: number, kind: '|' | '>'): string {
  const out: string[] = [];
  while (state.pos < state.lines.length) {
    const ln = state.lines[state.pos]!;
    if (ln.indent <= parentIndent) break;
    out.push(ln.content);
    state.pos++;
  }
  return kind === '|' ? out.join('\n') : out.join(' ');
}

function findMapColon(s: string): number {
  let inQ: '"' | "'" | null = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '\\' && inQ === '"') { i++; continue; }
      if (c === inQ) inQ = null;
      continue;
    }
    if (c === '"' || c === "'") { inQ = c; continue; }
    if (c === '[' || c === '{') { depth++; continue; }
    if (c === ']' || c === '}') { depth--; continue; }
    if (depth === 0 && c === ':') {
      const next = s[i + 1];
      if (next === undefined || next === ' ' || next === '\t') return i;
    }
  }
  return -1;
}

function unquoteKey(raw: string): string {
  return unquoteScalar(raw);
}

function unquoteScalar(raw: string): string {
  if (raw.length >= 2) {
    if (raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1).replace(/\\(.)/g, (_, c) => {
        if (c === 'n') return '\n';
        if (c === 't') return '\t';
        if (c === 'r') return '\r';
        return c;
      });
    }
    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1).replace(/''/g, "'");
    }
  }
  return raw;
}

function parseScalar(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('"') || t.startsWith("'")) return unquoteScalar(t);
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return null;
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^-?\d+\.\d*(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^-?\d+[eE][+-]?\d+$/.test(t)) return Number(t);
  return t;
}

function parseFlow(text: string): { value: unknown; rest: string } {
  const tokens = tokenizeFlow(text);
  const { value, idx } = parseFlowNode(tokens, 0);
  return { value, rest: tokens.slice(idx).join('') };
}

type FlowTok =
  | { kind: '['; }
  | { kind: ']'; }
  | { kind: '{'; }
  | { kind: '}'; }
  | { kind: ','; }
  | { kind: ':'; }
  | { kind: 'scalar'; text: string };

function tokenizeFlow(s: string): FlowTok[] {
  const out: FlowTok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '[' || c === ']' || c === '{' || c === '}' || c === ',') {
      out.push({ kind: c as '[' | ']' | '{' | '}' | ',' });
      i++;
      continue;
    }
    if (c === ':' && (s[i + 1] === undefined || /[\s,\]}]/.test(s[i + 1]!))) {
      out.push({ kind: ':' });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      const start = i;
      i++;
      while (i < s.length) {
        if (s[i] === '\\' && q === '"') { i += 2; continue; }
        if (s[i] === q) { i++; break; }
        i++;
      }
      out.push({ kind: 'scalar', text: s.slice(start, i) });
      continue;
    }
    let j = i;
    while (j < s.length && !/[\[\]{},:\s]/.test(s[j]!)) j++;
    if (j > i) {
      out.push({ kind: 'scalar', text: s.slice(i, j) });
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

function parseFlowNode(tokens: FlowTok[], idx: number): { value: unknown; idx: number } {
  const t = tokens[idx];
  if (!t) return { value: null, idx };
  if (t.kind === '[') {
    const arr: unknown[] = [];
    idx++;
    while (idx < tokens.length && tokens[idx]!.kind !== ']') {
      const sub = parseFlowNode(tokens, idx);
      arr.push(sub.value);
      idx = sub.idx;
      if (tokens[idx]?.kind === ',') idx++;
    }
    if (tokens[idx]?.kind === ']') idx++;
    return { value: arr, idx };
  }
  if (t.kind === '{') {
    const obj: Record<string, unknown> = {};
    idx++;
    while (idx < tokens.length && tokens[idx]!.kind !== '}') {
      const keyTok = tokens[idx];
      if (!keyTok || keyTok.kind !== 'scalar') { idx++; continue; }
      const key = unquoteScalar(keyTok.text);
      idx++;
      if (tokens[idx]?.kind === ':') idx++;
      const sub = parseFlowNode(tokens, idx);
      obj[key] = sub.value;
      idx = sub.idx;
      if (tokens[idx]?.kind === ',') idx++;
    }
    if (tokens[idx]?.kind === '}') idx++;
    return { value: obj, idx };
  }
  if (t.kind === 'scalar') {
    return { value: parseScalar(t.text), idx: idx + 1 };
  }
  return { value: null, idx: idx + 1 };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
