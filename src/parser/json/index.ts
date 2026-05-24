import type { JsonAst } from '../../ast/json.js';

const WRAPPER = /^@(start|end)\w+/i;
const TITLE = /^title\s+(.+)\s*$/i;
const HIGHLIGHT = /^#highlight\b/i;
const QUOTED_SEGMENT = /"([^"]+)"/g;

export function parseJson(source: string): JsonAst {
  const lines = source.split(/\r\n|\r|\n/);
  const highlights: string[][] = [];
  const jsonLines: string[] = [];
  let title = '';

  for (const raw of lines) {
    const t = raw.trim();
    if (WRAPPER.test(t)) continue;
    if (!t) continue;
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
    jsonLines.push(raw);
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

  return { kind: 'json', title, data, highlights, parseError };
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
