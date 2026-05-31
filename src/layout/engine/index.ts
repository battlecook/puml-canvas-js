/**
 * Public surface of the new layout engine module.
 *
 * Re-exports the engine contract (`LayoutEngine` + the data types it speaks)
 * and the first concrete backend (`DotSugiyamaEngine`). Diagram code does not
 * import from here yet — Step B will route consumers through this barrel.
 */

export type {
  BBox,
  EdgeLayout,
  EdgeSpec,
  LayoutEngine,
  LayoutGraph,
  LayoutOptions,
  LayoutResult,
  NodeLayout,
  NodeSpec,
  Point,
  SubgraphSpec,
} from './types.js';
export { edgeKey } from './types.js';
export { DotSugiyamaEngine } from './dot-sugiyama.js';
export {
  placeExternalLabels,
  type PlaceExternalLabelsInput,
  type PlaceExternalLabelsResult,
  type XLabelInput,
  type XLabelOptions,
  type XPoint,
  type XRect,
} from './xlabel.js';
