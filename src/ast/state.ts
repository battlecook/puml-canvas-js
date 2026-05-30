import type { EndMarker } from './class.js';

export type StateKind =
  | 'normal'
  | 'initial'
  | 'final'
  | 'choice'
  | 'fork'
  | 'join'
  | 'history';

export type StateLineStyle = 'solid' | 'dashed' | 'dotted' | 'bold';

export interface StateNode {
  id: string;
  name: string;
  stateKind: StateKind;
  children: StateNode[];
  /**
   * Back-compat: the first description attached via the inline `state X : text`
   * suffix. Newer description rows added via standalone `X : text` lines
   * accumulate in {@link descriptions}.
   */
  description?: string;
  /**
   * All description rows attached to the state. Each entry renders as a
   * separate row inside the state's box, below a horizontal divider that
   * separates the name section from the description section.
   */
  descriptions: string[];
  fill?: string;
  lineColor?: string;
  lineStyle?: StateLineStyle;
  textColor?: string;
  /**
   * When {@link stateKind} is `'history'`, distinguishes deep history (`[H*]`)
   * from shallow history (`[H]`). `true` = deep, falsy = shallow. Unused for
   * other state kinds.
   */
  isDeep?: boolean;
  /**
   * Raw stereotype token (lowercased) captured from `<<...>>` on the state
   * declaration, e.g. `'sdlreceive'`, `'task'`, `'input'`. Stereotypes that
   * map to a distinct {@link StateKind} (like `'choice'`) are reflected in
   * `stateKind` instead; this field carries the additional SDL/shape hints
   * the renderer uses to swap the default rounded rectangle for a custom
   * polygon (notched left edge, chevron, square corners, etc.).
   */
  stereotype?: string;
  /**
   * For composite states with concurrent (orthogonal) regions separated by
   * `--` or `||` inside the `{ ... }` block. Each entry is a list of child
   * node ids belonging to that region, in source order. When `regions` is
   * absent or has a single entry, the composite is treated as a single flat
   * region for back-compat (the implicit, default region).
   *
   * Every id in `regions` must also appear in {@link children}; `regions`
   * partitions the children into groups for layout. Transitions whose
   * endpoints both live inside the same region are laid out within that
   * region; cross-region transitions degrade to the composite-level layout
   * fallback.
   */
  regions?: string[][];
  /**
   * Direction in which {@link regions} should be stacked by the renderer.
   * Set by the parser based on which separator token introduced the
   * regions: `--` (horizontal rule) → `'vertical'` (regions above/below
   * with a horizontal dashed line between them); `||` (vertical rule) →
   * `'horizontal'` (regions side-by-side with a vertical dashed line
   * between them). If the source mixes both tokens (rare), the FIRST
   * separator encountered wins. Defaults to `'vertical'` for back-compat
   * if {@link regions} is set but this field is absent.
   */
  regionDirection?: 'vertical' | 'horizontal';
}

export interface StateTransition {
  source: string;
  target: string;
  arrowToken: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
}

export interface StateAst {
  kind: 'state';
  title: string;
  states: StateNode[];
  transitions: StateTransition[];
  /**
   * Diagram flow direction. `'TB'` (top-to-bottom, the default) stacks
   * sibling top-level states vertically; `'LR'` (left-to-right) packs them
   * into horizontal rows. Children inside a composite always flow
   * horizontally regardless of this setting. Set by the `left to right
   * direction` / `top to bottom direction` source-level directives.
   */
  direction?: 'TB' | 'LR';
}
