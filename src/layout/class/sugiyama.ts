import type { ClassRelationship, EndMarker } from '../../ast/class.js';

export interface LayoutEdge {
  from: string;
  to: string;
  rel: ClassRelationship;
  reversed: boolean;
}

export interface DrawableEdge {
  rel: ClassRelationship;
  fromId: string;
  toId: string;
  reversed: boolean;
  waypoints: string[];
}

export interface LayoutSegment {
  from: string;
  to: string;
  parentEdgeIdx: number;
}

export interface DummyInsertion {
  extendedNodeIds: string[];
  segments: LayoutSegment[];
  drawable: DrawableEdge[];
  dummyIds: Set<string>;
  layers: Map<string, number>;
}

export function buildLayoutEdges(rels: ClassRelationship[]): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  for (const rel of rels) {
    const above = aboveSide(rel);
    const fromId = above === 'source' ? rel.source : rel.target;
    const toId = above === 'source' ? rel.target : rel.source;
    if (fromId === toId) continue;
    edges.push({ from: fromId, to: toId, rel, reversed: false });
  }
  return edges;
}

function aboveSide(rel: ClassRelationship): 'source' | 'target' {
  const s = rel.sourceMarker;
  const t = rel.targetMarker;
  const isSpecial = (m: EndMarker): boolean =>
    m === 'triangle' || m === 'diamond-filled' || m === 'diamond-open';

  if (isSpecial(s) && !isSpecial(t)) return 'source';
  if (isSpecial(t) && !isSpecial(s)) return 'target';

  if (s === 'arrow' && t !== 'arrow') return 'target';
  if (t === 'arrow' && s !== 'arrow') return 'source';

  return 'source';
}

export function removeCycles(nodeIds: string[], edges: LayoutEdge[]): void {
  type Color = 'white' | 'gray' | 'black';
  const state = new Map<string, Color>();
  for (const id of nodeIds) state.set(id, 'white');

  const visit = (id: string): void => {
    state.set(id, 'gray');
    for (const e of edges) {
      if (e.from !== id) continue;
      const child = state.get(e.to);
      if (child === 'white') {
        visit(e.to);
      } else if (child === 'gray') {
        const tmp = e.from;
        e.from = e.to;
        e.to = tmp;
        e.reversed = !e.reversed;
      }
    }
    state.set(id, 'black');
  };

  for (const id of nodeIds) {
    if (state.get(id) === 'white') visit(id);
  }
}

export function assignLayers(nodeIds: string[], edges: LayoutEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  const preds = new Map<string, string[]>();
  for (const id of nodeIds) preds.set(id, []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    preds.get(e.to)!.push(e.from);
  }

  const stack = new Set<string>();

  const compute = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    let max = 0;
    for (const p of preds.get(id) ?? []) {
      const pl = compute(p);
      if (pl + 1 > max) max = pl + 1;
    }
    stack.delete(id);
    layer.set(id, max);
    return max;
  };

  for (const id of nodeIds) compute(id);
  return layer;
}

export function insertDummies(
  nodeIds: string[],
  edges: LayoutEdge[],
  layers: Map<string, number>,
): DummyInsertion {
  const extendedNodeIds = [...nodeIds];
  const extendedLayers = new Map(layers);
  const segments: LayoutSegment[] = [];
  const drawable: DrawableEdge[] = [];
  const dummyIds = new Set<string>();
  let counter = 0;

  for (const e of edges) {
    const fromL = extendedLayers.get(e.from) ?? 0;
    const toL = extendedLayers.get(e.to) ?? 0;
    const edgeIdx = drawable.length;
    const draw: DrawableEdge = {
      rel: e.rel,
      fromId: e.from,
      toId: e.to,
      reversed: e.reversed,
      waypoints: [],
    };
    drawable.push(draw);

    if (Math.abs(toL - fromL) <= 1) {
      segments.push({ from: e.from, to: e.to, parentEdgeIdx: edgeIdx });
      continue;
    }

    let prevId = e.from;
    const step = toL > fromL ? 1 : -1;
    for (let l = fromL + step; l !== toL; l += step) {
      const dummyId = `__dummy_${counter++}`;
      dummyIds.add(dummyId);
      extendedNodeIds.push(dummyId);
      extendedLayers.set(dummyId, l);
      draw.waypoints.push(dummyId);
      segments.push({ from: prevId, to: dummyId, parentEdgeIdx: edgeIdx });
      prevId = dummyId;
    }
    segments.push({ from: prevId, to: e.to, parentEdgeIdx: edgeIdx });
  }

  return { extendedNodeIds, segments, drawable, dummyIds, layers: extendedLayers };
}

export function groupByLayer(
  nodeIds: string[],
  layers: Map<string, number>,
): string[][] {
  const groups: string[][] = [];
  for (const id of nodeIds) {
    const l = layers.get(id) ?? 0;
    while (groups.length <= l) groups.push([]);
    groups[l]!.push(id);
  }
  return groups;
}

export function minimizeCrossings(
  initialOrder: string[][],
  segments: LayoutSegment[],
  options: { maxIterations?: number } = {},
): string[][] {
  const maxIterations = options.maxIterations ?? 24;
  if (initialOrder.length <= 1) return initialOrder.map((g) => [...g]);

  let current = initialOrder.map((g) => [...g]);
  let bestOrder = current.map((g) => [...g]);
  let bestCrossings = countCrossings(current, segments);
  if (bestCrossings === 0) return bestOrder;

  for (let iter = 0; iter < maxIterations; iter++) {
    for (let i = 0; i < current.length - 1; i++) {
      reorderLayer(current, i + 1, i, segments);
    }
    for (let i = current.length - 1; i > 0; i--) {
      reorderLayer(current, i - 1, i, segments);
    }
    const c = countCrossings(current, segments);
    if (c < bestCrossings) {
      bestCrossings = c;
      bestOrder = current.map((g) => [...g]);
      if (bestCrossings === 0) break;
    } else if (c >= bestCrossings && iter > 2) {
      break;
    }
  }
  return bestOrder;
}

function reorderLayer(
  layers: string[][],
  targetIdx: number,
  refIdx: number,
  segments: LayoutSegment[],
): void {
  const target = layers[targetIdx]!;
  const ref = layers[refIdx]!;
  const refPos = new Map<string, number>(ref.map((id, i) => [id, i]));

  const neighbors = new Map<string, number[]>();
  for (const id of target) neighbors.set(id, []);
  for (const seg of segments) {
    if (refPos.has(seg.from) && neighbors.has(seg.to)) {
      neighbors.get(seg.to)!.push(refPos.get(seg.from)!);
    } else if (refPos.has(seg.to) && neighbors.has(seg.from)) {
      neighbors.get(seg.from)!.push(refPos.get(seg.to)!);
    }
  }

  const bary = new Map<string, number>();
  for (let i = 0; i < target.length; i++) {
    const id = target[i]!;
    const ns = neighbors.get(id)!;
    bary.set(id, ns.length === 0 ? i : ns.reduce((a, b) => a + b, 0) / ns.length);
  }

  target.sort((a, b) => {
    const diff = bary.get(a)! - bary.get(b)!;
    return diff !== 0 ? diff : 0;
  });
}

export function countCrossings(layers: string[][], segments: LayoutSegment[]): number {
  let total = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    total += countLayerCrossings(layers[i]!, layers[i + 1]!, segments);
  }
  return total;
}

function countLayerCrossings(
  top: string[],
  bot: string[],
  segments: LayoutSegment[],
): number {
  const topIdx = new Map(top.map((id, i) => [id, i]));
  const botIdx = new Map(bot.map((id, i) => [id, i]));
  const pairs: Array<[number, number]> = [];
  for (const s of segments) {
    if (topIdx.has(s.from) && botIdx.has(s.to)) {
      pairs.push([topIdx.get(s.from)!, botIdx.get(s.to)!]);
    } else if (topIdx.has(s.to) && botIdx.has(s.from)) {
      pairs.push([topIdx.get(s.to)!, botIdx.get(s.from)!]);
    }
  }
  let count = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, b1] = pairs[i]!;
      const [a2, b2] = pairs[j]!;
      if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) count++;
    }
  }
  return count;
}

export interface CoordinateInput {
  orderedLayers: string[][];
  segments: LayoutSegment[];
  widthOf: (id: string) => number;
  dummyIds: Set<string>;
  horizontalGap: number;
  dummyGap: number;
  iterations?: number;
}

export interface CoordinateResult {
  centerX: Map<string, number>;
  layerWidths: number[];
  maxLayerWidth: number;
}

/**
 * Coordinate assignment with dummy-node straightening.
 *
 * Strategy:
 *   1. Compute the mechanical sequential x for every node — this matches what
 *      the caller's old cursor-based loop produced, including the per-layer
 *      centering inside `maxMechanicalWidth`. Real-node positions and overall
 *      diagram width come out identical to the legacy behaviour.
 *   2. Then iterate a relaxation pass that ONLY moves dummies. Each dummy's
 *      ideal x is the centroid of its segment neighbours; we clamp it between
 *      its left/right siblings in the same layer (real nodes act as fixed
 *      walls). This straightens long-edge waypoints onto the line between
 *      the real endpoints whenever the layer has room — without disturbing
 *      any real-node layout that existing diagrams already depend on.
 */
export function assignCoordinates(input: CoordinateInput): CoordinateResult {
  const {
    orderedLayers,
    segments,
    widthOf,
    dummyIds,
    horizontalGap,
    dummyGap,
    iterations = 6,
  } = input;

  const centerX = new Map<string, number>();
  const layerOf = new Map<string, number>();
  for (let l = 0; l < orderedLayers.length; l++) {
    for (const id of orderedLayers[l]!) layerOf.set(id, l);
  }

  const mechanicalWidths = orderedLayers.map((layer) => {
    let w = 0;
    let prev: 'box' | 'dummy' | null = null;
    for (const id of layer) {
      const isDummy = dummyIds.has(id);
      const nodeW = isDummy ? 0 : widthOf(id);
      if (prev !== null) w += isDummy || prev === 'dummy' ? dummyGap : horizontalGap;
      w += nodeW;
      prev = isDummy ? 'dummy' : 'box';
    }
    return w;
  });
  const maxLayerWidth = mechanicalWidths.length === 0 ? 0 : Math.max(...mechanicalWidths);

  // Per-layer-centered mechanical placement (matches legacy cursor loop)
  for (let l = 0; l < orderedLayers.length; l++) {
    const layer = orderedLayers[l]!;
    const layerW = mechanicalWidths[l]!;
    let cursor = (maxLayerWidth - layerW) / 2;
    let prev: 'box' | 'dummy' | null = null;
    for (const id of layer) {
      const isDummy = dummyIds.has(id);
      const w = isDummy ? 0 : widthOf(id);
      if (prev !== null) cursor += isDummy || prev === 'dummy' ? dummyGap : horizontalGap;
      centerX.set(id, cursor + w / 2);
      cursor += w;
      prev = isDummy ? 'dummy' : 'box';
    }
  }

  // Segment-neighbour adjacency for dummies
  const neighbors = new Map<string, string[]>();
  for (const layer of orderedLayers) {
    for (const id of layer) {
      if (dummyIds.has(id)) neighbors.set(id, []);
    }
  }
  for (const seg of segments) {
    if (dummyIds.has(seg.from)) neighbors.get(seg.from)!.push(seg.to);
    if (dummyIds.has(seg.to)) neighbors.get(seg.to)!.push(seg.from);
  }

  const minGapBetween = (left: string, right: string): number => {
    const ld = dummyIds.has(left);
    const rd = dummyIds.has(right);
    return ld || rd ? dummyGap : horizontalGap;
  };

  const relaxDummiesInLayer = (layer: string[]): void => {
    for (let i = 0; i < layer.length; i++) {
      const id = layer[i]!;
      if (!dummyIds.has(id)) continue;
      const ns = neighbors.get(id) ?? [];
      if (ns.length === 0) continue;
      let sum = 0;
      for (const n of ns) sum += centerX.get(n)!;
      const ideal = sum / ns.length;

      // Lower bound from left sibling
      let lo = -Infinity;
      if (i > 0) {
        const left = layer[i - 1]!;
        const lw = dummyIds.has(left) ? 0 : widthOf(left);
        lo = centerX.get(left)! + lw / 2 + minGapBetween(left, id);
      }
      // Upper bound from right sibling
      let hi = Infinity;
      if (i < layer.length - 1) {
        const right = layer[i + 1]!;
        const rw = dummyIds.has(right) ? 0 : widthOf(right);
        hi = centerX.get(right)! - rw / 2 - minGapBetween(id, right);
      }

      const clamped = Math.min(Math.max(ideal, lo), hi);
      centerX.set(id, clamped);
    }
  };

  for (let iter = 0; iter < iterations; iter++) {
    for (let l = 0; l < orderedLayers.length; l++) {
      relaxDummiesInLayer(orderedLayers[l]!);
    }
    for (let l = orderedLayers.length - 1; l >= 0; l--) {
      relaxDummiesInLayer(orderedLayers[l]!);
    }
  }

  return { centerX, layerWidths: mechanicalWidths, maxLayerWidth };
}
