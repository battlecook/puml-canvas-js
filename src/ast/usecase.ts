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
}

export interface UCContainer {
  id: string;
  label: string;
  childIds: string[];
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
}
