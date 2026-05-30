import type { UseCaseAst } from '../../ast/usecase.js';

/**
 * Resolved theme tokens for a use-case diagram derived from `ast.skin`. Each
 * field is the default (un-scoped) value pulled from a `skinparam usecase
 * { ... }` block (or top-level one-liner). Stereotype-scoped overrides are
 * looked up separately via `lookupStereotype` so callers can pick the right
 * variant per-node.
 *
 * `backgroundColor` is the **canvas** background — sourced only from a
 * top-level one-liner (`skinparam backgroundColor X`). `usecaseBackgroundColor`
 * is the default fill for use-case ellipses, sourced from
 * `skinparam usecase { BackgroundColor X }`. The two are intentionally
 * separate so a nested usecase fill doesn't bleed onto the canvas.
 */
export interface UCSkin {
  backgroundColor?: string;
  usecaseBackgroundColor?: string;
  borderColor?: string;
  arrowColor?: string;
  actorBackgroundColor?: string;
  actorBorderColor?: string;
  actorFontName?: string;
  handwritten?: boolean;
}

/**
 * Named-color resolver. Mirrors the trimmed set used by the sequence skin
 * module; extended just enough to cover the use-case demo input. Values that
 * already start with `#` pass through unchanged; unknown names also pass
 * through (the renderer / browser will resolve standard CSS names natively).
 */
const NAMED_COLORS: Record<string, string> = {
  deepskyblue: '#00BFFF',
  dodgerblue: '#1E90FF',
  aqua: '#00FFFF',
  blue: '#0000FF',
  lightblue: '#ADD8E6',
  darkseagreen: '#8FBC8F',
  darkslategray: '#2F4F4F',
  darkslategrey: '#2F4F4F',
  yellowgreen: '#9ACD32',
  olive: '#808000',
  gold: '#FFD700',
  black: '#000000',
  white: '#FFFFFF',
};

function resolveColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith('#')) return t;
  return NAMED_COLORS[t.toLowerCase()] ?? t;
}

/** Maps a raw font token to a CSS font-family chain with a graceful fallback. */
function fontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const quoted = /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
  // Use `monospace` as the broad fallback since common skinparam font names
  // (e.g. `Courier`) belong to that family.
  if (/courier|mono|consolas/i.test(trimmed)) return `${quoted}, monospace`;
  return `${quoted}, sans-serif`;
}

/**
 * Build the default (un-scoped) skin token set. Stereotype-scoped overrides
 * are stored alongside in the flat `ast.skin` map and resolved per-node by
 * `lookupStereotype`.
 *
 * Lookup convention: nested keys live under `usecase.<prop>` (written by the
 * shared `extractSkinparams` pre-pass when inside `skinparam usecase { ... }`)
 * and top-level one-liners live under `<prop>`. For every per-element token
 * we prefer the prefixed nested form, falling back to the unprefixed
 * one-liner so e.g. `skinparam BorderColor X` at the top level still themes
 * the usecase border. The canvas background is the deliberate exception: it
 * MUST come from the top-level `backgroundcolor` only, otherwise a nested
 * `skinparam usecase { BackgroundColor X }` would tint the whole page.
 */
export function buildUCSkin(ast: UseCaseAst): UCSkin {
  const s = ast.skin ?? {};
  const tokens: UCSkin = {};
  // Canvas background: top-level one-liner ONLY. Nested usecase fills must
  // not bleed onto the page.
  const bg = resolveColor(s['backgroundcolor']);
  if (bg) tokens.backgroundColor = bg;
  // Default ellipse fill: prefer `usecase.backgroundcolor`. No fallback to
  // unprefixed `backgroundcolor` — that's the canvas, not the ellipse.
  const ucBg = resolveColor(s['usecase.backgroundcolor']);
  if (ucBg) tokens.usecaseBackgroundColor = ucBg;
  const border = resolveColor(s['usecase.bordercolor'] ?? s['bordercolor']);
  if (border) tokens.borderColor = border;
  const arrow = resolveColor(s['usecase.arrowcolor'] ?? s['arrowcolor']);
  if (arrow) tokens.arrowColor = arrow;
  const aBg = resolveColor(s['usecase.actorbackgroundcolor'] ?? s['actorbackgroundcolor']);
  if (aBg) tokens.actorBackgroundColor = aBg;
  const aBorder = resolveColor(s['usecase.actorbordercolor'] ?? s['actorbordercolor']);
  if (aBorder) tokens.actorBorderColor = aBorder;
  const aFn = fontFamily(s['usecase.actorfontname'] ?? s['actorfontname']);
  if (aFn) tokens.actorFontName = aFn;
  if (s['handwritten']?.toLowerCase() === 'true') tokens.handwritten = true;
  return tokens;
}

/**
 * Look up a `<<stereo>>`-scoped value for the given property name. Returns
 * `undefined` if no override exists (callers fall back to the default token).
 * Property name is treated case-insensitively; the stereotype is matched
 * case-insensitively against the key written in the source.
 *
 * Stereo-scoped writes from inside `skinparam usecase { ... }` land under
 * `usecase.<prop><<stereo>>` (per the prefix convention in
 * `extractSkinparams`). We prefer that scoped form first, then fall back to
 * the unprefixed `<prop><<stereo>>` so top-level one-liners with a stereotype
 * scope keep working.
 */
export function lookupStereotypeColor(
  ast: UseCaseAst,
  property: string,
  stereotype: string | undefined,
): string | undefined {
  if (!stereotype || !ast.skin) return undefined;
  const prop = property.toLowerCase();
  const stereo = stereotype.toLowerCase();
  const prefixed = `usecase.${prop}<<${stereo}>>`;
  const flat = `${prop}<<${stereo}>>`;
  return resolveColor(ast.skin[prefixed] ?? ast.skin[flat]);
}
