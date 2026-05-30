import type { Shape } from '../../scene/types.js';
import { measureText } from './measure.js';

const FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 12;

/** Default inline-image dimensions used when rendering `<img:URL>` spans. */
const IMG_DEFAULT_W = 80;
const IMG_DEFAULT_H = 40;

export interface LabelSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  waved: boolean;
  mono: boolean;
  color: string | undefined;
  /** Optional override font family (e.g. `<font:monospaced>` → `monospace`). */
  family?: string;
  /** Optional background fill rendered behind the text (`<back:orange>`). */
  bgColor?: string;
  /** Optional font size override in px (`<size:20>`). */
  size?: number;
  /** Colored underline (`<u:red>`); falls back to `color` then `#000`. */
  underlineColor?: string;
  /** Colored strikethrough (`<s:green>`). */
  strikeColor?: string;
  /** Optional color override for the wavy underline (`<w:#0000FF>`). */
  waveColor?: string;
  /** Image URL when this span originated from `<img:url>` (text is `[img]`). */
  imgUrl?: string;
}

/**
 * Common emoji name → unicode lookup for `<:name:>` tokens. Names not in the
 * table fall back to `[name]` so the source text remains legible. The list is
 * intentionally tiny: it covers the documented PlantUML samples plus a few
 * staples; callers needing more should map via skinparams.
 */
const EMOJI: Record<string, string> = {
  calendar: '\u{1F4C5}',
  clock: '\u{1F552}',
  watch: '\u{231A}',
  smile: '\u{1F642}',
  smiley: '\u{1F603}',
  heart: '❤️',
  star: '⭐',
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  bulb: '\u{1F4A1}',
  phone: '\u{1F4DE}',
  mail: '✉️',
  email: '✉️',
  pencil: '✏️',
  rocket: '\u{1F680}',
  fire: '\u{1F525}',
  sun: '☀️',
  moon: '\u{1F319}',
  cloud: '☁️',
  person: '\u{1F464}',
  user: '\u{1F464}',
  computer: '\u{1F4BB}',
  package: '\u{1F4E6}',
  book: '\u{1F4D6}',
  bell: '\u{1F514}',
  gear: '⚙️',
  key: '\u{1F511}',
  lock: '\u{1F512}',
  unlock: '\u{1F513}',
};

/**
 * Small OpenIconic name → unicode map. Anything not in the map renders as the
 * generic gear glyph `⚙`, preserving width without leaving raw markup.
 */
const OPEN_ICONIC: Record<string, string> = {
  'account-login': '\u{1F511}',
  'account-logout': '\u{1F512}',
  person: '\u{1F464}',
  heart: '❤️',
  star: '⭐',
  check: '✔️',
  x: '❌',
  warning: '⚠️',
  cog: '⚙️',
  wrench: '\u{1F527}',
  home: '\u{1F3E0}',
  envelope: '✉️',
  bell: '\u{1F514}',
  bolt: '⚡',
  clock: '\u{1F552}',
};

const OPEN_ICONIC_FALLBACK = '⚙️';

/** Normalises a PlantUML font family alias to a real CSS family. */
function normaliseFamily(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (k === 'monospaced' || k === 'monospace' || k === 'courier') return 'monospace';
  if (k === 'serif' || k === 'times') return 'serif';
  if (k === 'sans-serif' || k === 'helvetica' || k === 'sansserif' || k === 'arial') return 'sans-serif';
  // Pass the raw value through for anything else — the SVG renderer will
  // attempt to use it as-is.
  return raw.trim();
}

/**
 * Mini HTML-like + creole markup parser for diagram labels.
 *
 * Creole toggles:
 *   `**bold**` `//italic//` `""mono""` `--strike--` `__underline__` `~~waved~~`
 *
 * HTML-like tags (open/close pairs; unclosed tags carry to end of text):
 *   `<b>`, `<i>`, `<u>`, `<s>`/`<strike>`, `<font color=X>`
 *
 * Colon-style PlantUML extensions (open until closing tag or end of text):
 *   `<font:Helvetica>`, `<color:blue>`, `<back:orange>`, `<size:20>`,
 *   `<u:red>...</u>`, `<s:green>...</s>`, `<w>...</w>`, `<w:#00f>...</w>`
 *
 * Inline substitutions (no styling state):
 *   `<U+221E>` → unicode codepoint;
 *   `<&account-login>` → OpenIconic glyph (small fallback table; unknown names
 *     render as a generic gear);
 *   `<:calendar:>` → emoji (small fallback table; unknown names render as
 *     `[name]`);
 *   `<img:URL>` → literal `[img]` text with the URL captured on the span.
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
  let family: string | undefined;
  let bgColor: string | undefined;
  let size: number | undefined;
  let underlineColor: string | undefined;
  let strikeColor: string | undefined;
  let waveColor: string | undefined;
  let imgUrl: string | undefined;
  let buf = '';
  const flush = (): void => {
    if (buf.length > 0) {
      const sp: LabelSpan = {
        text: buf,
        bold,
        italic,
        underline,
        strike,
        waved,
        mono,
        color,
      };
      // Only assign the new-style optional fields when they have a value so
      // the object stays compatible with `exactOptionalPropertyTypes`.
      if (family !== undefined) sp.family = family;
      if (bgColor !== undefined) sp.bgColor = bgColor;
      if (size !== undefined) sp.size = size;
      if (underlineColor !== undefined) sp.underlineColor = underlineColor;
      if (strikeColor !== undefined) sp.strikeColor = strikeColor;
      if (waveColor !== undefined) sp.waveColor = waveColor;
      if (imgUrl !== undefined) sp.imgUrl = imgUrl;
      out.push(sp);
      buf = '';
    }
  };
  let i = 0;
  while (i < s.length) {
    // Creole escape: `~__not underlined__` should NOT toggle underline. The
    // leading tilde escapes the entire matched creole pair — both the opener
    // AND the next matching closer — so the run renders as raw text. Mirrors
    // PlantUML's behaviour where `~__x__` outputs `__x__` literally.
    if (s[i] === '~' && i + 1 < s.length) {
      const next2 = s.substr(i + 1, 2);
      if (next2 === '**' || next2 === '//' || next2 === '""' || next2 === '--' || next2 === '__' || next2 === '~~') {
        buf += next2;
        // Search forward for the matching closer and emit everything up to
        // and including it as raw text.
        let j = i + 3;
        while (j < s.length && !s.startsWith(next2, j)) {
          buf += s[j];
          j++;
        }
        if (j < s.length) {
          buf += next2;
          j += 2;
        }
        i = j;
        continue;
      }
    }
    if (s.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue; }
    if (s.startsWith('//', i)) { flush(); italic = !italic; i += 2; continue; }
    if (s.startsWith('""', i)) { flush(); mono = !mono; i += 2; continue; }
    if (s.startsWith('--', i)) { flush(); strike = !strike; i += 2; continue; }
    if (s.startsWith('__', i)) { flush(); underline = !underline; i += 2; continue; }
    if (s.startsWith('~~', i)) { flush(); waved = !waved; i += 2; continue; }
    if (s[i] === '<') {
      const rest = s.slice(i);

      // Stereotype-style guillemets: `<<text>>` → `«text»` rendered italic
      // (PlantUML convention for stereotype-like annotations inside message
      // labels). Matched BEFORE the generic `<tag>` branch so `<<` is never
      // misread as a malformed HTML opener.
      const sm = /^<<\s*([^<>]*?)\s*>>/.exec(rest);
      if (sm) {
        flush();
        const inner = sm[1]!;
        const prevItalic: boolean = italic;
        italic = true;
        buf = `«${inner}»`;
        flush();
        italic = prevItalic;
        i += sm[0].length;
        continue;
      }

      // Unicode literal: `<U+221E>` → substitute the codepoint character.
      const um = /^<U\+([0-9A-Fa-f]{1,6})>/.exec(rest);
      if (um) {
        const cp = parseInt(um[1]!, 16);
        if (Number.isFinite(cp) && cp > 0) buf += String.fromCodePoint(cp);
        i += um[0].length;
        continue;
      }

      // OpenIconic: `<&name>` → glyph from the small fallback table.
      const om = /^<&([A-Za-z0-9_-]+)>/.exec(rest);
      if (om) {
        const key = om[1]!.toLowerCase();
        buf += OPEN_ICONIC[key] ?? OPEN_ICONIC_FALLBACK;
        i += om[0].length;
        continue;
      }

      // Emoji: `<:name:>` → unicode emoji or `[name]` fallback.
      const em = /^<:([A-Za-z0-9_+-]+):>/.exec(rest);
      if (em) {
        const key = em[1]!.toLowerCase();
        buf += EMOJI[key] ?? `[${em[1]}]`;
        i += em[0].length;
        continue;
      }

      // Image: `<img:URL>` → literal `[img]` placeholder, URL on span.
      const im = /^<img:([^>]+)>/i.exec(rest);
      if (im) {
        flush();
        imgUrl = im[1]!.trim();
        buf = '[img]';
        flush();
        imgUrl = undefined;
        i += im[0].length;
        continue;
      }

      // Colon-style open: `<font:monospaced>`, `<color:blue>`, `<back:orange>`,
      // `<size:20>`, `<u:red>`, `<s:green>`, `<w>` / `<w:#0000FF>`.
      const colonOpen = /^<(font|color|back|size|u|s|w)(?::([^>]+))?>/i.exec(rest);
      if (colonOpen) {
        const tag = colonOpen[1]!.toLowerCase();
        const val = colonOpen[2];
        // Only treat <u>/<s> as plain HTML when there's NO colon arg — the
        // generic `<tag>` branch below already handles that. Here we only
        // act on the colon-variant.
        if (tag === 'font' && val) { flush(); family = normaliseFamily(val); i += colonOpen[0].length; continue; }
        if (tag === 'color' && val) { flush(); color = val.trim(); i += colonOpen[0].length; continue; }
        if (tag === 'back' && val) { flush(); bgColor = val.trim(); i += colonOpen[0].length; continue; }
        if (tag === 'size' && val) {
          const n = parseFloat(val);
          if (Number.isFinite(n) && n > 0) { flush(); size = n; }
          i += colonOpen[0].length;
          continue;
        }
        if (tag === 'u' && val) { flush(); underline = true; underlineColor = val.trim(); i += colonOpen[0].length; continue; }
        if (tag === 's' && val) { flush(); strike = true; strikeColor = val.trim(); i += colonOpen[0].length; continue; }
        if (tag === 'w') {
          flush();
          waved = true;
          if (val) waveColor = val.trim();
          i += colonOpen[0].length;
          continue;
        }
      }

      // Colon-style close: `</font>`, `</color>`, `</back>`, `</size>`,
      // `</u>`, `</s>`, `</w>` reset the corresponding state.
      const colonClose = /^<\/(font|color|back|size|u|s|w)>/i.exec(rest);
      if (colonClose) {
        const tag = colonClose[1]!.toLowerCase();
        flush();
        // `</font>` closes BOTH the HTML-style `<font color=...>` (sets `color`)
        // and the colon-style `<font:family>` (sets `family`). Reset both so a
        // single closer cleanly ends either form.
        if (tag === 'font') { family = undefined; color = undefined; }
        else if (tag === 'color') color = undefined;
        else if (tag === 'back') bgColor = undefined;
        else if (tag === 'size') size = undefined;
        else if (tag === 'u') { underline = false; underlineColor = undefined; }
        else if (tag === 's') { strike = false; strikeColor = undefined; }
        else if (tag === 'w') { waved = false; waveColor = undefined; }
        i += colonClose[0].length;
        continue;
      }

      // Generic HTML-like tag (handles <b>, <i>, <u>, <s>, <strike>, <font ...>).
      const m = /^<\s*(\/?)([A-Za-z]+)((?:\s+[^>]*)?)>/.exec(rest);
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
  for (const sp of spans) {
    if (sp.imgUrl) w += IMG_DEFAULT_W;
    else w += measureText(sp.text, sp.size ?? fontSize).width;
  }
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
    !spans[0]!.color &&
    !spans[0]!.family &&
    !spans[0]!.bgColor &&
    !spans[0]!.imgUrl &&
    spans[0]!.size === undefined
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
  const sizeOf = (sp: LabelSpan): number => sp.size ?? FONT_SIZE;
  const widths = spans.map((sp) =>
    sp.imgUrl ? IMG_DEFAULT_W : measureText(sp.text, sizeOf(sp)).width,
  );
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursor = x;
  if (anchor === 'middle') cursor = x - totalW / 2;
  else if (anchor === 'end') cursor = x - totalW;
  const out: Shape[] = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i]!;
    const w = widths[i]!;
    const sz = sizeOf(sp);
    if (sp.imgUrl) {
      // Inline image: emit an `image` shape vertically centred on the text
      // baseline. The default 80x40 box is the same regardless of the line's
      // font size; if it's larger than the line height it will visually
      // extend past the surrounding text (acceptable for this iteration).
      const imgH = IMG_DEFAULT_H;
      const imgY = baseline === 'middle' ? y - imgH / 2 : y - imgH + sz * 0.2;
      out.push({
        type: 'image',
        x: cursor,
        y: imgY,
        w: IMG_DEFAULT_W,
        h: imgH,
        href: sp.imgUrl,
      });
      cursor += w;
      continue;
    }
    if (sp.text.length > 0) {
      if (sp.bgColor) {
        // Background swatch sits behind the glyphs. Height tracks the actual
        // font size so `<size:20>` and `<size:8>` both stay visually centred.
        const padY = 2;
        const rectH = sz + padY * 2;
        const rectY = baseline === 'middle' ? y - rectH / 2 : y - sz + padY;
        out.push({
          type: 'rect',
          x: cursor,
          y: rectY,
          w,
          h: rectH,
          style: { fill: sp.bgColor, stroke: 'none' },
        });
      }
      out.push({
        type: 'text',
        x: cursor,
        y,
        text: sp.text,
        anchor: 'start',
        baseline,
        font: {
          family: sp.family ?? (sp.mono ? 'monospace' : FONT_FAMILY),
          size: sz,
          weight: sp.bold ? 'bold' : 'normal',
          style: sp.italic ? 'italic' : 'normal',
          color: sp.color ?? '#000',
        },
      });
      const defaultStroke = sp.color ?? '#000';
      if (sp.underline) {
        const uy = baseline === 'middle' ? y + sz / 2 : y + 2;
        out.push({
          type: 'line',
          x1: cursor, y1: uy, x2: cursor + w, y2: uy,
          style: { stroke: sp.underlineColor ?? defaultStroke, strokeWidth: 1 },
        });
      }
      if (sp.strike) {
        // Line-through sits roughly halfway through the cap height.
        const sy = baseline === 'middle' ? y - 1 : y - sz / 3;
        out.push({
          type: 'line',
          x1: cursor, y1: sy, x2: cursor + w, y2: sy,
          style: { stroke: sp.strikeColor ?? defaultStroke, strokeWidth: 1 },
        });
      }
      if (sp.waved) {
        // Approximated wavy underline as a polyline zig-zag.
        const wy = baseline === 'middle' ? y + sz / 2 + 2 : y + 3;
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
          style: { stroke: sp.waveColor ?? defaultStroke, strokeWidth: 1, fill: 'none' },
        });
      }
    }
    cursor += w;
  }
  return out;
}
