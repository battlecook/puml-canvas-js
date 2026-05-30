import type { StateNode } from '../../ast/state.js';
import type { Shape, Style } from '../../scene/types.js';

/**
 * Width/height for the thick horizontal bar used to render `<<fork>>` and
 * `<<join>>` pseudo-states. ~80 px wide and ~6 px tall, filled black with no
 * border — the bar visually distinguishes the synchronization/split point
 * from a normal state's rounded rectangle.
 */
export const PSEUDO_FORK_W = 80;
export const PSEUDO_FORK_H = 6;
/**
 * Radius for `<<start>>` (filled black dot, same visual as the `[*]` initial
 * pseudo-state).
 */
export const PSEUDO_START_R = 8;
/**
 * Outer radius for `<<end>>` (outer ring with an inner filled black circle,
 * same visual as the `[*]` final pseudo-state target).
 */
export const PSEUDO_END_R = 9;
/**
 * Color used to fill the fork/join bar and the start/end pseudo-state dots.
 */
export const PSEUDO_COLOR = '#222';

/**
 * Returns the shape(s) for a pseudo-state kind (`fork`, `join`, `initial`,
 * `final`) using the canonical sizes/colors defined above, or `null` for any
 * other state kind. Centralizes the rendering used by both the flat and
 * nested state-diagram layouts so the two paths stay in sync.
 *
 * The bounding box passed in (`x`, `y`, `w`, `h`) determines where the shape
 * is drawn; the caller is expected to size the leaf box using the same
 * canonical dimensions so the bar/circle fills the slot exactly.
 */
export function pseudoStateShape(
  node: StateNode,
  x: number,
  y: number,
  w: number,
  h: number,
): Shape[] | null {
  switch (node.stateKind) {
    case 'fork':
    case 'join':
      // Thick wide horizontal bar; no border. Labels/names are not rendered
      // for fork/join bars — the bar itself IS the synchronization marker.
      return [
        {
          type: 'rect',
          x, y, w, h,
          style: { fill: PSEUDO_COLOR, stroke: PSEUDO_COLOR, strokeWidth: 0 },
        },
      ];
    case 'initial':
      // Filled black dot (same visual as the `[*]` initial pseudo-state).
      return [
        {
          type: 'circle',
          cx: x + w / 2,
          cy: y + h / 2,
          r: w / 2,
          style: { fill: PSEUDO_COLOR, stroke: PSEUDO_COLOR, strokeWidth: 1 },
        },
      ];
    case 'final':
      // Outer ring + inner filled black circle (same visual as the `[*]`
      // final pseudo-state target marker).
      return [
        {
          type: 'circle',
          cx: x + w / 2,
          cy: y + h / 2,
          r: w / 2,
          style: { fill: '#fff', stroke: PSEUDO_COLOR, strokeWidth: 1.2 },
        },
        {
          type: 'circle',
          cx: x + w / 2,
          cy: y + h / 2,
          r: w / 2 - 4,
          style: { fill: PSEUDO_COLOR, stroke: PSEUDO_COLOR, strokeWidth: 1 },
        },
      ];
    default:
      return null;
  }
}

/**
 * Returns a shape implementing the SDL stereotype outline (sdlreceive,
 * input, output, task, etc.) for the given state, or `null` if the state
 * has no recognized SDL stereotype. The shape replaces the default rounded
 * rectangle that normal states use; text/description rows are drawn on top
 * by the caller.
 *
 * Supported stereotypes (case-insensitive, parsed from `<<...>>`):
 *  - `sdlreceive` / `input` — rectangle with a triangular notch on the LEFT
 *    edge (input event marker); rendered as a polygon with 5 vertices.
 *  - `output`               — rectangle with a chevron on the RIGHT edge
 *    (output marker); rendered as a 5-vertex polygon.
 *  - `task`                 — plain rectangle with square corners (no
 *    rounded fillets), rendered as a `rect` without `rx`/`ry`.
 *
 * Other SDL stereotypes (procedure, save, load, continuous) fall through
 * and are rendered using the default rounded rectangle; callers may extend
 * this function to add them.
 */
export function sdlOutlineShape(
  node: StateNode,
  x: number,
  y: number,
  w: number,
  h: number,
  style: Style,
): Shape | null {
  const stereo = (node.stereotype ?? '').toLowerCase();
  if (!stereo) return null;
  const notch = Math.min(10, h / 2 - 1);
  switch (stereo) {
    case 'sdlreceive':
    case 'input':
      // Rectangle with a triangular notch cut INTO the left edge. Polygon
      // vertices, clockwise from top-left: TL → TR → BR → BL → notch tip
      // (mid-left, pointing right).
      return {
        type: 'polygon',
        points: [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x + notch, y + h / 2],
        ],
        style,
      };
    case 'output':
      // Rectangle with a chevron jutting OUT on the right edge: TL →
      // mid-right tip → BL.
      return {
        type: 'polygon',
        points: [
          [x, y],
          [x + w - notch, y],
          [x + w, y + h / 2],
          [x + w - notch, y + h],
          [x, y + h],
        ],
        style,
      };
    case 'task':
      // Square-cornered rectangle (no rounded fillets).
      return {
        type: 'rect',
        x, y, w, h,
        style,
      };
    default:
      return null;
  }
}
