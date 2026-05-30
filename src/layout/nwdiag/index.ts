import type {
  NwdiagAst,
  NwdiagNetwork,
  NwdiagTopNode,
} from '../../ast/nwdiag.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 24;
const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const LABEL_GAP_Y = 4;
const LABEL_PAD_X = 12;
// Width of the network bar reserved for the label column on the left.
// If a network's name+address is wider, the column expands to fit.
const LABEL_COL_W_MIN = 120;
// Width reserved for the network bar to the right of the label column.
const BAR_W_MIN = 320;
const BAR_H = 28;
// Vertical gap between successive network bars.
const NETWORK_GAP_Y = 60;
// Top-level node box dimensions (default shape).
const TOP_NODE_W = 80;
const TOP_NODE_H = 40;
// Cloud-shape dimensions are a bit wider/taller to read as a cloud silhouette.
const CLOUD_W = 100;
const CLOUD_H = 56;
// Row of top-level nodes sits above the first network bar with this padding.
const TOP_NODE_ROW_GAP = 24;
// Member-node rectangles attached to the network bar.
const MEMBER_W = 64;
const MEMBER_H = 32;
// Vertical drop from the bar to the centre of the member-node row.
const MEMBER_DROP = 40;

const COLOR_BAR_FILL = '#cfe2ff';
const COLOR_BAR_STROKE = '#3a6cb2';
const COLOR_TEXT = '#222';
const COLOR_NODE_FILL = '#fff';
const COLOR_NODE_STROKE = '#3a6cb2';
const COLOR_LINK = '#555';

/**
 * Render a minimal network diagram. The scene is laid out top-to-bottom:
 *   1. (Optional) top-level nodes — declared outside any `network { }` block —
 *      placed on a single row. Each renders in its declared shape (cloud,
 *      otherwise plain rect) and may participate in `A -- B` links.
 *   2. One horizontal bar per network. The label column on the left holds the
 *      name (and optional address); member nodes hang as small rects beneath
 *      the bar at evenly-spaced x positions.
 *
 * Top-level link lines are routed between node-centre positions, drawn behind
 * the node shapes via insertion-order (links pushed first, nodes after).
 */
export function layoutNwdiag(ast: NwdiagAst): Scene {
  const topNodes = ast.nodes ?? [];
  const links = ast.links ?? [];

  if (ast.networks.length === 0 && topNodes.length === 0) {
    return emptyScene();
  }

  // Compute the label-column width from the widest name/address text.
  let labelW = LABEL_COL_W_MIN;
  for (const net of ast.networks) {
    const nameW = net.name ? measureText(net.name, FONT_LABEL).width : 0;
    const addrW = net.address ? measureText(net.address, FONT_LABEL).width : 0;
    const maxLabelW = Math.max(nameW, addrW) + LABEL_PAD_X * 2;
    if (maxLabelW > labelW) labelW = maxLabelW;
  }

  const barW = Math.max(BAR_W_MIN, labelW + 200);
  const barX0 = PAGE_PAD + labelW;

  // Position top-level nodes. Place each one according to whichever network
  // member position aligns with it (if shared); otherwise spread them evenly
  // across the bar width. This keeps `inet -- router` a short vertical link
  // when `router` is also a member of the network below.
  const memberX = computeMemberXMap(ast.networks, barX0, barW);
  const topNodePositions = layoutTopNodes(topNodes, barX0, barW, memberX);

  // Vertical layout: top-node row first (if any), then network bars.
  const topRowH = topNodes.length > 0 ? maxTopNodeHeight(topNodes) : 0;
  const firstBarY = PAGE_PAD + topRowH + (topNodes.length > 0 ? TOP_NODE_ROW_GAP : 0);
  // Network bars also reserve space below for any member nodes.
  const networkBlockH = BAR_H + (anyHasMembers(ast.networks) ? MEMBER_DROP + MEMBER_H / 2 + PAGE_PAD : 0);

  const totalW = PAGE_PAD * 2 + labelW + barW;
  const totalH =
    PAGE_PAD +
    topRowH +
    (topNodes.length > 0 ? TOP_NODE_ROW_GAP : 0) +
    ast.networks.length * BAR_H +
    Math.max(0, ast.networks.length - 1) * NETWORK_GAP_Y +
    (anyHasMembers(ast.networks) ? MEMBER_DROP + MEMBER_H / 2 : 0) +
    PAGE_PAD;

  const children: Shape[] = [];

  // Network bars (and their members). Track member positions so links can
  // resolve `router` to the member-node centre if it lives in a network.
  const memberPositions = new Map<string, { x: number; y: number }>();
  let y = firstBarY;
  for (const net of ast.networks) {
    const drawn = drawNetwork(net, PAGE_PAD, y, labelW, barW, memberPositions);
    children.push(...drawn);
    y += BAR_H + NETWORK_GAP_Y;
  }

  // Top-level links — drawn after the bars but before the top-level node
  // shapes so the line tails hide under the node bodies.
  const allPositions = new Map(memberPositions);
  for (const pos of topNodePositions) {
    allPositions.set(pos.id, { x: pos.cx, y: pos.cy });
  }
  for (const link of links) {
    const fromPos = allPositions.get(link.from);
    const toPos = allPositions.get(link.to);
    if (!fromPos || !toPos) continue;
    children.push(drawLink(fromPos, toPos));
  }

  // Top-level nodes last (so they paint over link endpoints).
  for (const pos of topNodePositions) {
    children.push(...drawTopNode(pos));
  }

  // `networkBlockH` is computed but unused in totalH (kept above) — silence
  // the lint by reading it. The visual layout already accounts for the
  // network bar plus member row.
  void networkBlockH;

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children,
  };
}

/* ---------- top-level node placement ---------- */

interface PlacedTopNode {
  id: string;
  shape: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function layoutTopNodes(
  nodes: NwdiagTopNode[],
  barX0: number,
  barW: number,
  memberX: Map<string, number>,
): PlacedTopNode[] {
  if (nodes.length === 0) return [];
  // Top row Y centre: half a node height down from PAGE_PAD.
  const placed: PlacedTopNode[] = [];

  // For each node, prefer to align with a member x if the same id appears in a
  // network below. Otherwise distribute evenly across the bar.
  const aligned = nodes.map((n) => {
    const memX = memberX.get(n.id);
    return { node: n, hasAnchor: memX !== undefined, anchorX: memX };
  });

  const unanchored = aligned.filter((a) => !a.hasAnchor).length;
  // Spread unanchored nodes evenly across the bar; anchored ones snap to
  // their member column.
  let unanchoredIndex = 0;
  for (const a of aligned) {
    const dims = topNodeDims(a.node);
    const cy = PAGE_PAD + dims.h / 2;
    let cx: number;
    if (a.hasAnchor && a.anchorX !== undefined) {
      cx = a.anchorX;
    } else {
      // Evenly distribute: position k of N at barX0 + barW * (k+1)/(N+1).
      cx = barX0 + (barW * (unanchoredIndex + 1)) / (unanchored + 1);
      unanchoredIndex++;
    }
    placed.push({
      id: a.node.id,
      shape: (a.node.shape ?? 'rect').toLowerCase(),
      cx,
      cy,
      w: dims.w,
      h: dims.h,
    });
  }
  return placed;
}

function topNodeDims(node: NwdiagTopNode): { w: number; h: number } {
  const shape = (node.shape ?? '').toLowerCase();
  if (shape === 'cloud') return { w: CLOUD_W, h: CLOUD_H };
  return { w: TOP_NODE_W, h: TOP_NODE_H };
}

function maxTopNodeHeight(nodes: NwdiagTopNode[]): number {
  let h = 0;
  for (const n of nodes) {
    const d = topNodeDims(n);
    if (d.h > h) h = d.h;
  }
  return h;
}

function drawTopNode(p: PlacedTopNode): Shape[] {
  const shapes: Shape[] = [];
  if (p.shape === 'cloud') {
    shapes.push({
      type: 'ellipse',
      cx: p.cx,
      cy: p.cy,
      rx: p.w / 2,
      ry: p.h / 2,
      style: { fill: COLOR_NODE_FILL, stroke: COLOR_NODE_STROKE, strokeWidth: 1.5 },
    });
  } else {
    shapes.push({
      type: 'rect',
      x: p.cx - p.w / 2,
      y: p.cy - p.h / 2,
      w: p.w,
      h: p.h,
      style: { fill: COLOR_NODE_FILL, stroke: COLOR_NODE_STROKE, strokeWidth: 1.5 },
    });
  }
  shapes.push({
    type: 'text',
    x: p.cx,
    y: p.cy,
    text: p.id,
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: FONT_LABEL, color: COLOR_TEXT },
  });
  return shapes;
}

/* ---------- network rendering ---------- */

function drawNetwork(
  net: NwdiagNetwork,
  x: number,
  y: number,
  labelW: number,
  barW: number,
  memberPositions: Map<string, { x: number; y: number }>,
): Shape[] {
  const shapes: Shape[] = [];

  // Network bar to the right of the label column.
  shapes.push({
    type: 'rect',
    x: x + labelW,
    y,
    w: barW,
    h: BAR_H,
    style: {
      fill: COLOR_BAR_FILL,
      stroke: COLOR_BAR_STROKE,
      strokeWidth: 1.5,
    },
  });

  // Label column: name (if present) on top line, address (if any) below.
  const hasAddr = !!net.address;
  const hasName = net.name !== '';
  if (hasName) {
    const nameY = hasAddr ? y + BAR_H / 2 - LABEL_GAP_Y : y + BAR_H / 2;
    shapes.push({
      type: 'text',
      x: x + labelW - LABEL_PAD_X,
      y: nameY,
      text: net.name,
      anchor: 'end',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: COLOR_TEXT },
    });
  }
  if (hasAddr) {
    const addrY = hasName ? y + BAR_H / 2 + FONT_LABEL - LABEL_GAP_Y : y + BAR_H / 2;
    shapes.push({
      type: 'text',
      x: x + labelW - LABEL_PAD_X,
      y: addrY,
      text: net.address!,
      anchor: 'end',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: COLOR_TEXT },
    });
  }

  // Member nodes attached below the bar.
  if (net.nodes.length > 0) {
    const barX0 = x + labelW;
    const positions = evenlySpacedX(net.nodes.length, barX0, barW);
    const nodeCy = y + BAR_H + MEMBER_DROP;
    for (let i = 0; i < net.nodes.length; i++) {
      const member = net.nodes[i]!;
      const cx = positions[i]!;
      // Stub line from bar bottom to the top of the member rect.
      shapes.push({
        type: 'line',
        x1: cx,
        y1: y + BAR_H,
        x2: cx,
        y2: nodeCy - MEMBER_H / 2,
        style: { stroke: COLOR_LINK, strokeWidth: 1 },
      });
      shapes.push({
        type: 'rect',
        x: cx - MEMBER_W / 2,
        y: nodeCy - MEMBER_H / 2,
        w: MEMBER_W,
        h: MEMBER_H,
        style: { fill: COLOR_NODE_FILL, stroke: COLOR_NODE_STROKE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'text',
        x: cx,
        y: nodeCy,
        text: member.id,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_LABEL, color: COLOR_TEXT },
      });
      // Track for top-level link routing — use the top-edge centre so the link
      // visually connects to the rect, not its middle.
      memberPositions.set(member.id, { x: cx, y: nodeCy - MEMBER_H / 2 });
    }
  }

  return shapes;
}

/* ---------- helpers ---------- */

function drawLink(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Shape {
  return {
    type: 'line',
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    style: { stroke: COLOR_LINK, strokeWidth: 1 },
  };
}

function evenlySpacedX(n: number, x0: number, width: number): number[] {
  // n positions inside [x0, x0+width], spaced at (k+1)/(n+1) of the width.
  const xs: number[] = [];
  for (let k = 0; k < n; k++) {
    xs.push(x0 + (width * (k + 1)) / (n + 1));
  }
  return xs;
}

/** Build a map: member-node id -> x centre, taken from the first network that
 *  declares it as a member. Used to anchor top-level nodes above their
 *  matching member column. */
function computeMemberXMap(
  networks: NwdiagNetwork[],
  barX0: number,
  barW: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const net of networks) {
    if (net.nodes.length === 0) continue;
    const xs = evenlySpacedX(net.nodes.length, barX0, barW);
    for (let i = 0; i < net.nodes.length; i++) {
      const id = net.nodes[i]!.id;
      if (!out.has(id)) out.set(id, xs[i]!);
    }
  }
  return out;
}

function anyHasMembers(networks: NwdiagNetwork[]): boolean {
  for (const n of networks) if (n.nodes.length > 0) return true;
  return false;
}

function emptyScene(): Scene {
  return {
    width: 240,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 120,
        y: 30,
        text: '(empty network diagram)',
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#999' },
      },
    ],
  };
}
