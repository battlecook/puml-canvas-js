import type { SequenceAst } from '../../ast/sequence.js';

/**
 * Resolved set of theme tokens derived from `ast.skin`. Each field carries the
 * default (`undefined` → caller picks its hard-coded constant) or the resolved
 * value from a `skinparam` directive. Colors are hex strings (named colors
 * already converted via `SKIN_NAMED_COLORS` in the parser), font names are raw
 * tokens that may need a CSS fallback chain at the call site.
 *
 * Layout reads from a module-local current-skin slot set at the top of
 * `layoutSequence`. Helpers (headers, message draw, etc.) call `getSkin()` to
 * read it. This avoids threading a SkinTokens argument through ~15 functions.
 */
export interface SkinTokens {
  backgroundColor?: string;
  arrowColor?: string;
  participantBackgroundColor?: string;
  participantBorderColor?: string;
  participantFontColor?: string;
  participantFontSize?: number;
  participantFontName?: string;
  actorBackgroundColor?: string;
  actorBorderColor?: string;
  actorFontColor?: string;
  actorFontSize?: number;
  actorFontName?: string;
  lifelineBorderColor?: string;
  lifelineBackgroundColor?: string;
  handwritten?: boolean;
  /** `skinparam actorStyle` value, lower-cased. Recognised values are
   * `'awesome'` and `'hollow'`; anything else (or absent) means the default
   * stick-figure rendering. */
  actorStyle?: 'awesome' | 'hollow' | 'stickman';
}

/**
 * Resolved style tokens derived from `ast.styles`. Each field carries the
 * SVG `strokeDasharray` string (e.g. `'1,4'`) or the sentinel `'none'` to
 * mean "solid line — no dasharray". `undefined` means "fall back to the
 * default for this selector". Currently only `LineStyle` is honoured;
 * `LineColor` / `BackgroundColor` etc. are silently dropped.
 */
export interface StyleTokens {
  lifelineDasharray?: string;
  delayDasharray?: string;
  arrowDasharray?: string;
  participantDasharray?: string;
}

const SKIN_NAMED_COLORS: Record<string, string> = {
  deepskyblue: '#00BFFF',
  dodgerblue: '#1E90FF',
  aqua: '#00FFFF',
  blue: '#0000FF',
  lightblue: '#ADD8E6',
};

/** Mirrors `resolveSkinColor` in the parser; duplicated here so layout can
 * resolve values stored verbatim in `ast.skin`. */
function resolveColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith('#')) return raw;
  return SKIN_NAMED_COLORS[raw.toLowerCase()] ?? raw;
}

function num(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Maps font names with spaces to a CSS font-family chain. Real PlantUML uses
 * font like `Aapex` (cursive) and `Impact` (heavy sans). We provide a chain
 * so missing fonts gracefully fall back to a stylistically similar family.
 */
function fontFamily(name: string | undefined, role: 'participant' | 'actor'): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const quoted = /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
  if (role === 'actor') return `${quoted}, cursive, sans-serif`;
  // Participant role: heavy sans fallback chain.
  return `${quoted}, "Arial Black", Impact, sans-serif`;
}

/**
 * Read a skin map value preferring the `sequence.<prop>` prefix (written by
 * the shared `extractSkinparams` pre-pass when nested inside
 * `skinparam sequence { ... }`) then falling back to the unprefixed top-level
 * one-liner. `backgroundcolor` is intentionally lookup-up unprefixed only —
 * the canvas background must come from a top-level `skinparam backgroundColor
 * X`, not from a nested per-element fill.
 */
function pick(s: Record<string, string>, prop: string): string | undefined {
  return s[`sequence.${prop}`] ?? s[prop];
}

export function buildSkin(ast: SequenceAst): SkinTokens {
  const s = ast.skin ?? {};
  const tokens: SkinTokens = {};
  // Canvas background — top-level one-liner only.
  const bg = resolveColor(s['backgroundcolor']);
  if (bg) tokens.backgroundColor = bg;
  const arrow = resolveColor(pick(s, 'arrowcolor'));
  if (arrow) tokens.arrowColor = arrow;
  const pBg = resolveColor(pick(s, 'participantbackgroundcolor'));
  if (pBg) tokens.participantBackgroundColor = pBg;
  const pBorder = resolveColor(pick(s, 'participantbordercolor'));
  if (pBorder) tokens.participantBorderColor = pBorder;
  const pFc = resolveColor(pick(s, 'participantfontcolor'));
  if (pFc) tokens.participantFontColor = pFc;
  const pFs = num(pick(s, 'participantfontsize'));
  if (pFs !== undefined) tokens.participantFontSize = pFs;
  const pFn = fontFamily(pick(s, 'participantfontname'), 'participant');
  if (pFn) tokens.participantFontName = pFn;
  const aBg = resolveColor(pick(s, 'actorbackgroundcolor'));
  if (aBg) tokens.actorBackgroundColor = aBg;
  const aBorder = resolveColor(pick(s, 'actorbordercolor'));
  if (aBorder) tokens.actorBorderColor = aBorder;
  const aFc = resolveColor(pick(s, 'actorfontcolor'));
  if (aFc) tokens.actorFontColor = aFc;
  const aFs = num(pick(s, 'actorfontsize'));
  if (aFs !== undefined) tokens.actorFontSize = aFs;
  const aFn = fontFamily(pick(s, 'actorfontname'), 'actor');
  if (aFn) tokens.actorFontName = aFn;
  const llBorder = resolveColor(pick(s, 'lifelinebordercolor'));
  if (llBorder) tokens.lifelineBorderColor = llBorder;
  const llBg = resolveColor(pick(s, 'lifelinebackgroundcolor'));
  if (llBg) tokens.lifelineBackgroundColor = llBg;
  if (s['handwritten']?.toLowerCase() === 'true') tokens.handwritten = true;
  const rawActorStyle = pick(s, 'actorstyle')?.toLowerCase();
  if (rawActorStyle === 'awesome' || rawActorStyle === 'hollow') {
    tokens.actorStyle = rawActorStyle;
  } else if (rawActorStyle === 'stickman') {
    tokens.actorStyle = 'stickman';
  }
  return tokens;
}

// Module-local "currently active" tokens. `layoutSequence` calls `setSkin`
// before any draw helpers run, and `clearSkin` after. Helpers read via
// `getSkin()`. The lifecycle is bracketed so concurrent calls (none in
// practice — single-threaded JS) couldn't interleave, but we still clear at
// the end to avoid carrying state across diagrams.
let currentSkin: SkinTokens = {};

export function setSkin(tokens: SkinTokens): void {
  currentSkin = tokens;
}
export function getSkin(): SkinTokens {
  return currentSkin;
}
export function clearSkin(): void {
  currentSkin = {};
}

/**
 * Converts a `LineStyle` value (as written inside a `<style>` block) into an
 * SVG `strokeDasharray` string. Returns `'none'` for solid lines (the caller
 * suppresses the `strokeDasharray` attribute), `undefined` for unparseable
 * input.
 *
 *   `'0'` / `'solid'`     → `'none'`
 *   `'N'` (single int)     → `'N,N'`
 *   `'N-M'` (and longer)   → `'N,M'` (`'N,M,P,Q'`, ...)
 */
export function lineStyleToDasharray(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'solid') return 'none';
  if (/^\d+$/.test(v)) return `${v},${v}`;
  if (/^\d+(-\d+)+$/.test(v)) return v.split('-').join(',');
  return undefined;
}

export function buildStyles(ast: { styles?: Record<string, Record<string, string>> }): StyleTokens {
  const s = ast.styles ?? {};
  const tokens: StyleTokens = {};
  const ll = lineStyleToDasharray(s['lifeline']?.['linestyle']);
  if (ll !== undefined) tokens.lifelineDasharray = ll;
  const dl = lineStyleToDasharray(s['delay']?.['linestyle']);
  if (dl !== undefined) tokens.delayDasharray = dl;
  const ar = lineStyleToDasharray(s['arrow']?.['linestyle']);
  if (ar !== undefined) tokens.arrowDasharray = ar;
  const pp = lineStyleToDasharray(s['participant']?.['linestyle']);
  if (pp !== undefined) tokens.participantDasharray = pp;
  return tokens;
}

let currentStyles: StyleTokens = {};

export function setStyles(tokens: StyleTokens): void {
  currentStyles = tokens;
}
export function getStyles(): StyleTokens {
  return currentStyles;
}
export function clearStyles(): void {
  currentStyles = {};
}
