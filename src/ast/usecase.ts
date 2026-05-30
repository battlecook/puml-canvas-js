import type { EndMarker, RelationDirection } from './class.js';

export type UCNodeKind = 'actor' | 'usecase' | 'note';

export type NoteSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Block-level fragment of a multi-line usecase label.
 *
 * - `text`        – one or more consecutive plain text lines (joined by `\n`).
 * - `sep-solid`   – a horizontal divider drawn from `--`.
 * - `sep-double`  – a bold/double-weight divider drawn from `==`.
 * - `sep-dotted`  – a dotted divider drawn from `..`.
 * - `sep-titled`  – a dotted divider with a centered title (`..Title..`).
 */
export type LabelBlock =
  | { kind: 'text'; text: string }
  | { kind: 'sep-solid' }
  | { kind: 'sep-double' }
  | { kind: 'sep-dotted' }
  | { kind: 'sep-titled'; text: string };

export interface UCNode {
  id: string;
  name: string;
  kind: UCNodeKind;
  /**
   * Pre-parsed structure for multi-line usecase labels that contain
   * separators (`--`, `==`, `..`, `..Title..`). Present only when the label
   * spans more than one logical line or contains a separator. Layout switches
   * to a stadium / rounded-rect shape when this field is set.
   */
  labelBlocks?: LabelBlock[];
  /**
   * For note nodes (`kind: 'note'`), the body text. Multi-line note bodies
   * are joined with real `\n` characters. Layout splits on `\n` and renders
   * one line per segment.
   */
  text?: string;
  /**
   * For attached notes (`note right of X`, etc.), the id of the anchor node.
   * Layout positions the note adjacent to the anchor's bounding box.
   */
  anchorId?: string;
  /**
   * Which side of the anchor the note sits on. Defaults to `'right'` when
   * absent.
   */
  anchorSide?: NoteSide;
  /**
   * Stereotype text from a trailing `<< text >>` block on the declaration
   * line. Stored without guillemets or whitespace padding; layout renders
   * it as a small italic `«text»` line above the node label.
   */
  stereotype?: string;
  /**
   * "Business" marker — set when the source declaration uses the `/`
   * shorthand. For use cases (`(Foo)/`, `usecase/ Foo`), layout draws an
   * extra vertical chord on the left side of the ellipse / stadium. For
   * actors (`:Foo:/`, `actor/ Foo`), layout overlays a small diagonal slash
   * mark on the figure to distinguish a business actor from a regular one.
   */
  business?: boolean;
  /**
   * Fill colour parsed from an inline `#<styleBlock>` trailing the node
   * declaration (e.g. `actor b #pink;line:red`). Applies to the actor head
   * circle / awesome silhouette body, or to the use-case ellipse interior.
   * Overrides any skin-derived default when present.
   */
  fill?: string;
  /**
   * Stroke colour for the node outline, parsed from the inline `#<styleBlock>`
   * via the `line:<color>` token (or used as a fallback for a bare colour
   * when no `line:` was given but a stroke would otherwise be the only
   * sensible target). Layout substitutes this for the default border colour.
   */
  lineColor?: string;
  /**
   * Per-node line-style override parsed from the inline `#<styleBlock>`.
   * `line.bold` thickens the stroke, `line.dashed` / `line.dotted` swap in
   * the matching `strokeDasharray`. Layout reads this when drawing the
   * actor body / use-case ellipse outline.
   */
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  /**
   * Label text colour parsed from the inline `#<styleBlock>` via the
   * `text:<color>` token. Layout uses this in place of the default label
   * colour for the node's name (and multi-block rows, for use cases).
   */
  textColor?: string;
}

export interface UCRelationship {
  source: string;
  target: string;
  arrowToken: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
  /**
   * Inline direction hint stripped from the arrow body (`-left->`, `--up->`,
   * `-r->`, …). Tells layout which side of the source the target should sit
   * on. Absent when the arrow had no hint.
   */
  direction?: RelationDirection;
  /**
   * Stroke color for the relationship line, parsed from an inline
   * `#<styleBlock>` between the target and the optional `:` label. Recognised
   * source forms include `#<colorName>` (bare colour) and `line:<colorName>`.
   * Layout overrides the default edge stroke with this colour when set.
   */
  lineColor?: string;
  /**
   * Per-relationship line-style override parsed from the inline `#<styleBlock>`.
   * `line.dashed` / `line.dotted` / `line.bold` map to the matching variants;
   * the parser-level `style` (`solid` | `dashed`) is kept as the structural
   * grammar's classification and remains untouched. Layout reads this field
   * (if present) to pick the dasharray and stroke-width for rendering.
   */
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  /**
   * Text colour for the relationship label, from the inline `text:<colorName>`
   * token of the `#<styleBlock>`. Layout uses this in place of the default
   * label colour when set.
   */
  textColor?: string;
}

export interface UCContainer {
  id: string;
  label: string;
  childIds: string[];
}

/**
 * Embedded JSON block (`json NAME { ... }`) inside a use-case diagram that
 * enabled `allowmixing`. Stored separately from `nodes` because JSON blocks
 * don't participate in the sugiyama layered layout — they're rendered as
 * a standalone key/value table below the main diagram. `data` holds the
 * `JSON.parse`d object/array (or `null` if the body was empty / invalid).
 */
export interface UCJsonNode {
  id: string;
  data: unknown;
  /** Set when `JSON.parse` failed; layout renders an error scene instead. */
  parseError?: string;
}

export interface UseCaseAst {
  kind: 'usecase';
  title: string;
  nodes: UCNode[];
  containers: UCContainer[];
  relationships: UCRelationship[];
  /**
   * Diagram flow direction. `'TB'` (top-to-bottom, the default) stacks
   * sugiyama ranks vertically and orders nodes within a rank horizontally.
   * `'LR'` (left-to-right) swaps the two axes so ranks march across the page
   * and nodes within a rank stack vertically. Set by the `left to right
   * direction` / `top to bottom direction` source-level directives.
   */
  direction?: 'TB' | 'LR';
  /**
   * Skinparam map populated by `skinparam` directives (one-liners and block
   * form). Keys are lower-cased; group prefixes are dropped. Values are kept
   * as the raw token tail of the source line. Layout reads `actorstyle` to
   * pick between stick-figure and `awesome` silhouette rendering.
   */
  skin?: Record<string, string>;
  /**
   * Embedded `json NAME { ... }` blocks introduced by `allowmixing`. Layout
   * renders each as a standalone key/value table positioned below the main
   * actor/usecase content. Empty / absent when the diagram had no JSON
   * blocks.
   */
  jsonNodes?: UCJsonNode[];
}
