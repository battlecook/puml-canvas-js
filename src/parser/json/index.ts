import type { JsonAst } from '../../ast/json.js';

const WRAPPER = /^@(start|end)\w+/i;
const TITLE = /^title\s+(.+)\s*$/i;
const HIGHLIGHT = /^#highlight\b/i;
const QUOTED_SEGMENT = /"([^"]+)"/g;
const STYLE_OPEN = /<style>/i;
const STYLE_CLOSE = /<\/style>/i;
const CLASS_DECL = /^\.([A-Za-z_][\w-]*)\s*\{\s*(.*?)\s*\}\s*$/;
const CLASS_REF = /<<\s*([A-Za-z_][\w-]*)\s*>>/;

export function parseJson(source: string): JsonAst {
  const raw = source.split(/\r\n|\r|\n/);
  // 1) Strip the <style>...</style> block (may span lines) up front.
  const { remaining, styleBody } = extractStyleBlock(raw);
  const styles = parseStyleBody(styleBody);

  const highlights: string[][] = [];
  const highlightClassNames: Array<string | undefined> = [];
  const jsonLines: string[] = [];
  let title = '';

  for (const line of remaining) {
    const t = line.trim();
    if (WRAPPER.test(t)) continue;
    if (!t) continue;
    if (HIGHLIGHT.test(t)) {
      const parsed = parseHighlightLine(t);
      if (parsed.path.length > 0) {
        highlights.push(parsed.path);
        highlightClassNames.push(parsed.className);
      }
      continue;
    }
    const tm = TITLE.exec(t);
    if (tm) {
      title = tm[1]!.trim();
      continue;
    }
    jsonLines.push(line);
  }

  let data: unknown = null;
  let parseError = '';
  const body = jsonLines.join('\n').trim();
  if (body) {
    try {
      data = JSON.parse(body);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    kind: 'json',
    title,
    data,
    highlights,
    highlightClassNames,
    styles,
    parseError,
  };
}

function extractStyleBlock(lines: string[]): { remaining: string[]; styleBody: string } {
  const out: string[] = [];
  const collected: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!inside) {
      const m = STYLE_OPEN.exec(line);
      if (m) {
        // Capture inline content after <style> if any
        const after = line.slice(m.index + m[0].length);
        const closeM = STYLE_CLOSE.exec(after);
        if (closeM) {
          collected.push(after.slice(0, closeM.index));
        } else {
          if (after.trim()) collected.push(after);
          inside = true;
        }
        continue;
      }
      out.push(line);
    } else {
      const cm = STYLE_CLOSE.exec(line);
      if (cm) {
        const before = line.slice(0, cm.index);
        if (before.trim()) collected.push(before);
        inside = false;
        // anything after </style> on the same line is dropped (PlantUML never
        // places content after the closing tag in practice)
        continue;
      }
      collected.push(line);
    }
  }
  return { remaining: out, styleBody: collected.join('\n') };
}

function parseStyleBody(body: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!body.trim()) return out;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = CLASS_DECL.exec(line);
    if (!m) continue;
    const name = m[1]!;
    const inner = m[2] ?? '';
    out[name] = parseStyleProps(inner);
  }
  return out;
}

/** Parse space-separated `Key Value Key Value` pairs into a lowercased map.
 * Values may be single tokens (`green`, `bold`, `#FF0`). Quoted values are
 * supported in case fonts grow spaces. */
function parseStyleProps(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tokens = tokenizeStyleBody(text);
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const key = tokens[i]!.toLowerCase();
    const value = tokens[i + 1]!;
    if (!key) continue;
    if (key === 'fontstyle') {
      // Accumulate (e.g. "FontStyle italic FontStyle bold" — unlikely but safe)
      out[key] = out[key] ? `${out[key]} ${value.toLowerCase()}` : value.toLowerCase();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function tokenizeStyleBody(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === ' ' || c === '\t' || c === ';' || c === ',') {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < text.length && text[j] !== q) j++;
      out.push(text.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !/[\s;,]/.test(text[j]!)) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

function parseHighlightLine(text: string): { path: string[]; className?: string } {
  let body = text.replace(/^#highlight\s*/i, '');
  let className: string | undefined;
  const cm = CLASS_REF.exec(body);
  if (cm) {
    className = cm[1]!;
    body = body.slice(0, cm.index) + body.slice(cm.index + cm[0].length);
  }
  const segments: string[] = [];
  QUOTED_SEGMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_SEGMENT.exec(body)) !== null) {
    segments.push(m[1]!);
  }
  const result: { path: string[]; className?: string } = { path: segments };
  if (className !== undefined) result.className = className;
  return result;
}
