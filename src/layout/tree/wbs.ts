import type { TreeNode, WbsAst } from '../../ast/tree.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const BOX_PAD_X = 12;
const BOX_PAD_Y = 8;
const BOX_MIN_W = 80;
const SIBLING_GAP = 18;
const LEVEL_GAP = 28;
const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 12;
const COLOR_LINE = '#222';
const COLOR_EDGE = '#666';

const LEVEL_FILLS = ['#cfe2ff', '#d6ecdb', '#fbecc3', '#fbd9d4', '#e4d4f4'];

interface WbsLayout {
  width: number;
  height: number;
  centerX: number;
  draw(x: number, y: number): Shape[];
}

export function layoutWbs(ast: WbsAst): Scene {
  if (!ast.root) return emptyScene('wbs');

  const tree = layoutNode(ast.root, 0);
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const totalW = tree.width + PAGE_PAD * 2;
  const totalH = tree.height + PAGE_PAD * 2 + titleHeight;

  const children: Shape[] = [];
  if (ast.title) {
    children.push({
      type: 'text',
      x: totalW / 2,
      y: PAGE_PAD + TITLE_FONT,
      text: ast.title,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
    });
  }
  children.push(...tree.draw(PAGE_PAD, PAGE_PAD + titleHeight));

  return { width: totalW, height: totalH, background: '#fff', children };
}

function layoutNode(node: TreeNode, depth: number): WbsLayout {
  const text = node.text;
  const m = measureText(text, FONT_SIZE);
  const boxless = node.boxless === true;
  // Boxless nodes get no horizontal padding (just the text width) and a
  // tight height — they still need to occupy real space for routing.
  const boxW = boxless
    ? Math.max(BOX_MIN_W / 2, m.width + 4)
    : Math.max(BOX_MIN_W, m.width + BOX_PAD_X * 2);
  const boxH = boxless ? m.height + 4 : m.height + BOX_PAD_Y * 2;

  if (node.children.length === 0) {
    return {
      width: boxW,
      height: boxH,
      centerX: boxW / 2,
      draw(x, y) {
        return drawNode(node, x, y, boxW, boxH, depth);
      },
    };
  }

  // Partition children into LEFT and RIGHT groups. `side === 'left'` lays out
  // to the left of the parent (the WBS arithmetic `-` marker); everything
  // else is rendered to the right (the default WBS direction).
  const leftChildren: TreeNode[] = [];
  const rightChildren: TreeNode[] = [];
  for (const c of node.children) {
    if (c.side === 'left') leftChildren.push(c);
    else rightChildren.push(c);
  }
  const leftLayouts = leftChildren.map((c) => layoutNode(c, depth + 1));
  const rightLayouts = rightChildren.map((c) => layoutNode(c, depth + 1));

  const sumWidths = (ls: WbsLayout[]): number => {
    let w = 0;
    for (let i = 0; i < ls.length; i++) {
      w += ls[i]!.width;
      if (i < ls.length - 1) w += SIBLING_GAP;
    }
    return w;
  };
  const leftW = sumWidths(leftLayouts);
  const rightW = sumWidths(rightLayouts);
  // Total children row width: left group + gap + right group.
  // If either side is empty, no extra gap between them.
  const gapBetween = leftLayouts.length && rightLayouts.length ? SIBLING_GAP : 0;
  const childrenW = leftW + gapBetween + rightW;
  const allChildren = [...leftLayouts, ...rightLayouts];
  const childrenMaxH = allChildren.length ? Math.max(...allChildren.map((c) => c.height)) : 0;

  const width = Math.max(boxW, childrenW);
  const height = boxH + (allChildren.length ? LEVEL_GAP + childrenMaxH : 0);
  const centerX = width / 2;

  return {
    width,
    height,
    centerX,
    draw(x, y) {
      const shapes: Shape[] = [];
      const boxX = x + centerX - boxW / 2;
      shapes.push(...drawNode(node, boxX, y, boxW, boxH, depth));

      if (!allChildren.length) return shapes;

      const childY = y + boxH + LEVEL_GAP;
      const childrenStartX = x + (width - childrenW) / 2;
      const parentCx = x + centerX;
      const parentBottomY = y + boxH;
      const elbowY = (parentBottomY + childY) / 2;

      let cursorX = childrenStartX;
      // Walk left group first (preserves source order within each side).
      for (const c of leftLayouts) {
        const childCx = cursorX + c.centerX;
        shapes.push({
          type: 'polyline',
          points: [
            [parentCx, parentBottomY],
            [parentCx, elbowY],
            [childCx, elbowY],
            [childCx, childY],
          ],
          style: { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' },
        });
        shapes.push(...c.draw(cursorX, childY));
        cursorX += c.width + SIBLING_GAP;
      }
      if (leftLayouts.length && rightLayouts.length) {
        // Consume the explicit gap between groups (already counted in childrenW).
        cursorX += gapBetween - SIBLING_GAP;
      }
      for (const c of rightLayouts) {
        const childCx = cursorX + c.centerX;
        shapes.push({
          type: 'polyline',
          points: [
            [parentCx, parentBottomY],
            [parentCx, elbowY],
            [childCx, elbowY],
            [childCx, childY],
          ],
          style: { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' },
        });
        shapes.push(...c.draw(cursorX, childY));
        cursorX += c.width + SIBLING_GAP;
      }
      return shapes;
    },
  };
}

function drawNode(
  node: TreeNode,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
): Shape[] {
  if (node.boxless) {
    return [
      {
        type: 'text',
        x: x + w / 2,
        y: y + h / 2,
        text: node.text,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
      },
    ];
  }
  const fill = node.color ?? LEVEL_FILLS[depth % LEVEL_FILLS.length]!;
  return [
    {
      type: 'rect',
      x, y, w, h,
      rx: 3, ry: 3,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: x + w / 2,
      y: y + h / 2,
      text: node.text,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    },
  ];
}

function emptyScene(kind: string): Scene {
  return {
    width: 220,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 110, y: 30,
        text: `(empty ${kind} diagram)`,
        anchor: 'middle', baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
