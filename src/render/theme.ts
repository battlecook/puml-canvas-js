import type { FontStyle, Scene, Shape, Style } from '../scene/types.js';

export type Theme = 'light' | 'dark';

/**
 * Default page background used for dark theme when the scene did not set one.
 * Layout code never populates `scene.background`, so without this the SVG would
 * render transparent and dark-inverted shapes would sit on the host page's
 * (usually white) backdrop.
 */
const DARK_DEFAULT_BACKGROUND = '#1e1e1e';

/**
 * CSS keyword values that carry no concrete color and must survive the remap
 * untouched — inverting them would either break rendering (`none`) or discard
 * intent (`currentColor` inherits from the SVG's `color`).
 */
const PASSTHROUGH = new Set(['none', 'transparent', 'currentcolor', 'inherit']);

/**
 * CSS named colors that actually appear as bare (non-hex) values in this
 * codebase — either emitted directly by layout code or resolved from the
 * parser's PlantUML color tables. Only these are understood; any other named
 * color is left untouched so we never guess at a value we can't verify.
 */
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  gray: '#808080',
  grey: '#808080',
  gold: '#ffd700',
  pink: '#ffc0cb',
  aqua: '#00ffff',
  lightblue: '#add8e6',
  deepskyblue: '#00bfff',
  dodgerblue: '#1e90ff',
};

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Remap a scene's colors for the requested theme. `light` is a no-op that
 * returns the original scene reference (so golden output is byte-identical to
 * pre-theme behavior). `dark` returns a new scene tree with every fill, stroke,
 * font color and the background lightness-inverted; hue and saturation are
 * preserved so intentional accents (a red arrow, a blue note) keep their color.
 */
export function applyTheme(scene: Scene, theme: Theme): Scene {
  if (theme === 'light') return scene;

  return {
    ...scene,
    background: invertColor(scene.background) ?? DARK_DEFAULT_BACKGROUND,
    children: scene.children.map(invertShape),
  };
}

function invertShape(shape: Shape): Shape {
  switch (shape.type) {
    case 'group':
      return { ...shape, children: shape.children.map(invertShape) };
    case 'text':
      return shape.font ? { ...shape, font: invertFont(shape.font) } : shape;
    case 'image':
      return shape;
    default:
      return shape.style ? { ...shape, style: invertStyle(shape.style) } : shape;
  }
}

function invertStyle(style: Style): Style {
  const next: Style = { ...style };
  if (style.fill !== undefined) next.fill = invertColor(style.fill) ?? style.fill;
  if (style.stroke !== undefined) next.stroke = invertColor(style.stroke) ?? style.stroke;
  return next;
}

function invertFont(font: FontStyle): FontStyle {
  if (font.color === undefined) return font;
  return { ...font, color: invertColor(font.color) ?? font.color };
}

/**
 * Invert a single color's lightness. Returns `undefined` when the input is
 * missing or can't be parsed, letting callers fall back to the original value.
 * Passthrough keywords are returned verbatim.
 */
function invertColor(color: string | undefined): string | undefined {
  if (color === undefined) return undefined;
  const trimmed = color.trim();
  if (trimmed === '') return undefined;
  if (PASSTHROUGH.has(trimmed.toLowerCase())) return trimmed;

  const rgba = parseColor(trimmed);
  if (!rgba) return undefined;

  const { h, s, l } = rgbToHsl(rgba.r, rgba.g, rgba.b);
  const { r, g, b } = hslToRgb(h, s, invertLightness(l));
  return formatRgba({ r, g, b, a: rgba.a });
}

/**
 * Map lightness onto its dark-theme counterpart. The core is a plain
 * inversion (`1 - l`) so black↔white and hue/saturation are preserved, with a
 * gentle curve that lifts what would be pure-black results a little so inverted
 * light backgrounds land near the `#1e1e1e` page tone rather than dead black.
 */
function invertLightness(l: number): number {
  const inverted = 1 - l;
  // Compress the top of the range slightly: keeps mid tones intact while
  // softening near-white inputs away from pure black.
  return inverted * 0.92 + 0.04;
}

function parseColor(color: string): Rgba | null {
  const named = NAMED_COLORS[color.toLowerCase()];
  if (named) return parseHex(named);
  if (color.startsWith('#')) return parseHex(color);
  if (/^rgba?\(/i.test(color)) return parseRgbFunc(color);
  return null;
}

function parseHex(hex: string): Rgba | null {
  const body = hex.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(body)) {
    return {
      r: parseInt(body[0] + body[0], 16),
      g: parseInt(body[1] + body[1], 16),
      b: parseInt(body[2] + body[2], 16),
      a: 1,
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(body)) {
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

function parseRgbFunc(color: string): Rgba | null {
  const match = color.match(/^rgba?\(([^)]*)\)$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => p.trim());
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : null;
  };
  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if (r === null || g === null || b === null) return null;
  let a = 1;
  if (parts.length === 4) {
    const parsed = Number(parts[3]);
    if (!Number.isFinite(parsed)) return null;
    a = Math.max(0, Math.min(1, parsed));
  }
  return { r, g, b, a };
}

function formatRgba({ r, g, b, a }: Rgba): string {
  const round = (n: number) => Math.round(n);
  if (a >= 1) {
    const hex = (n: number) => round(n).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${a})`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChannel(p, q, h + 1 / 3) * 255,
    g: hueToChannel(p, q, h) * 255,
    b: hueToChannel(p, q, h - 1 / 3) * 255,
  };
}

function hueToChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
