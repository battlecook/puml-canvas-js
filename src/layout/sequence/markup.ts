import type { Shape } from '../../scene/types.js';
import { measureText } from './measure.js';

const FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 12;

export interface LabelSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  waved: boolean;
  mono: boolean;
  color: string | undefined;
}

/**
 * Mini HTML-like + creole markup parser for sequence labels.
 *
 * Creole toggles:
 *   `**bold**` `//italic//` `""mono""` `--strike--` `__underline__` `~~waved~~`
 *
 * HTML-like tags (open/close pairs; unclosed tags carry to end of line):
 *   `<b>`, `<i>`, `<u>`, `<s>`/`<strike>`, `<font color=X>`
 *
 * Unknown tags are silently dropped. Returns a flat sequence of styled spans.
 */
export function parseLabelMarkup(s: string): LabelSpan[] {
  const out: LabelSpan[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let waved = false;
  let mono = false;
  let color: string | undefined;
  let buf = '';
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ text: buf, bold, italic, underline, strike, waved, mono, color });
      buf = '';
    }
  };
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue; }
    if (s.startsWith('//', i)) { flush(); italic = !italic; i += 2; continue; }
    if (s.startsWith('""', i)) { flush(); mono = !mono; i += 2; continue; }
    if (s.startsWith('--', i)) { flush(); strike = !strike; i += 2; continue; }
    if (s.startsWith('__', i)) { flush(); underline = !underline; i += 2; continue; }
    if (s.startsWith('~~', i)) { flush(); waved = !waved; i += 2; continue; }
    if (s[i] === '<') {
      const m = /^<\s*(\/?)([A-Za-z]+)((?:\s+[^>]*)?)>/.exec(s.slice(i));
      if (m) {
        flush();
        const closing = m[1] === '/';
        const tag = m[2]!.toLowerCase();
        const attrs = m[3] ?? '';
        if (tag === 'b') bold = !closing;
        else if (tag === 'i') italic = !closing;
        else if (tag === 'u') underline = !closing;
        else if (tag === 's' || tag === 'strike') strike = !closing;
        else if (tag === 'font') {
          if (closing) {
            color = undefined;
          } else {
            const cm = /color\s*=\s*"?([^"\s>]+)"?/i.exec(attrs);
            if (cm) color = cm[1];
          }
        }
        i += m[0].length;
        continue;
      }
    }
    buf += s[i];
    i++;
  }
  flush();
  return out;
}

/** Width of a multi-span line as it would render. */
export function measureSpansWidth(spans: LabelSpan[], fontSize: number = DEFAULT_FONT_SIZE): number {
  let w = 0;
  for (const sp of spans) w += measureText(sp.text, fontSize).width;
  return w;
}

export function drawLabelSpans(
  spans: LabelSpan[],
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end',
  baseline: 'alphabetic' | 'middle' = 'alphabetic',
  fontSize: number = DEFAULT_FONT_SIZE,
): Shape[] {
  const FONT_SIZE = fontSize;
  if (spans.length === 0) return [];
  // Fast path: a plain unstyled label keeps the legacy single-text rendering
  // so plain-message goldens stay byte-identical.
  if (
    spans.length === 1 &&
    !spans[0]!.bold &&
    !spans[0]!.italic &&
    !spans[0]!.underline &&
    !spans[0]!.strike &&
    !spans[0]!.waved &&
    !spans[0]!.mono &&
    !spans[0]!.color
  ) {
    return [{
      type: 'text',
      x, y,
      text: spans[0]!.text,
      anchor,
      baseline,
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    }];
  }
  const widths = spans.map((sp) => measureText(sp.text, FONT_SIZE).width);
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursor = x;
  if (anchor === 'middle') cursor = x - totalW / 2;
  else if (anchor === 'end') cursor = x - totalW;
  const out: Shape[] = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i]!;
    const w = widths[i]!;
    if (sp.text.length > 0) {
      out.push({
        type: 'text',
        x: cursor,
        y,
        text: sp.text,
        anchor: 'start',
        baseline,
        font: {
          family: sp.mono ? 'monospace' : FONT_FAMILY,
          size: FONT_SIZE,
          weight: sp.bold ? 'bold' : 'normal',
          style: sp.italic ? 'italic' : 'normal',
          color: sp.color ?? '#000',
        },
      });
      const stroke = sp.color ?? '#000';
      if (sp.underline) {
        const uy = baseline === 'middle' ? y + FONT_SIZE / 2 : y + 2;
        out.push({
          type: 'line',
          x1: cursor, y1: uy, x2: cursor + w, y2: uy,
          style: { stroke, strokeWidth: 1 },
        });
      }
      if (sp.strike) {
        // Line-through sits roughly halfway through the cap height.
        const sy = baseline === 'middle' ? y - 1 : y - FONT_SIZE / 3;
        out.push({
          type: 'line',
          x1: cursor, y1: sy, x2: cursor + w, y2: sy,
          style: { stroke, strokeWidth: 1 },
        });
      }
      if (sp.waved) {
        // Approximated wavy underline as a polyline zig-zag.
        const wy = baseline === 'middle' ? y + FONT_SIZE / 2 + 2 : y + 3;
        const STEP = 3;
        const AMP = 1.5;
        const pts: [number, number][] = [];
        let xx = cursor;
        let phase = 0;
        while (xx < cursor + w) {
          pts.push([xx, wy + (phase ? -AMP : AMP)]);
          xx += STEP;
          phase = 1 - phase;
        }
        pts.push([cursor + w, wy]);
        out.push({
          type: 'polyline',
          points: pts,
          style: { stroke, strokeWidth: 1, fill: 'none' },
        });
      }
    }
    cursor += w;
  }
  return out;
}
