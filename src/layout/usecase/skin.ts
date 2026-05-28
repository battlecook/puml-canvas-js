import type { UseCaseAst } from '../../ast/usecase.js';

/**
 * Resolved theme tokens for a use-case diagram derived from `ast.skin`. Each
 * field is the default (un-scoped) value pulled from a `skinparam usecase
 * { ... }` block (or top-level one-liner). Stereotype-scoped overrides are
 * looked up separately via `lookupStereotype` so callers can pick the right
 * variant per-node.
 */
export interface UCSkin {
  backgroundColor?: string;
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
 */
export function buildUCSkin(ast: UseCaseAst): UCSkin {
  const s = ast.skin ?? {};
  const tokens: UCSkin = {};
  const bg = resolveColor(s['backgroundcolor']);
  if (bg) tokens.backgroundColor = bg;
  const border = resolveColor(s['bordercolor']);
  if (border) tokens.borderColor = border;
  const arrow = resolveColor(s['arrowcolor']);
  if (arrow) tokens.arrowColor = arrow;
  const aBg = resolveColor(s['actorbackgroundcolor']);
  if (aBg) tokens.actorBackgroundColor = aBg;
  const aBorder = resolveColor(s['actorbordercolor']);
  if (aBorder) tokens.actorBorderColor = aBorder;
  const aFn = fontFamily(s['actorfontname']);
  if (aFn) tokens.actorFontName = aFn;
  if (s['handwritten']?.toLowerCase() === 'true') tokens.handwritten = true;
  return tokens;
}

/**
 * Look up a `<<stereo>>`-scoped value for the given property name. Returns
 * `undefined` if no override exists (callers fall back to the default token).
 * Property name is treated case-insensitively; the stereotype is matched
 * case-insensitively against the key written in the source.
 */
export function lookupStereotypeColor(
  ast: UseCaseAst,
  property: string,
  stereotype: string | undefined,
): string | undefined {
  if (!stereotype || !ast.skin) return undefined;
  const key = `${property.toLowerCase()}<<${stereotype.toLowerCase()}>>`;
  return resolveColor(ast.skin[key]);
}
