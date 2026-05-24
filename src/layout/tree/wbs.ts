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
  const boxW = Math.max(BOX_MIN_W, m.width + BOX_PAD_X * 2);
  const boxH = m.height + BOX_PAD_Y * 2;

  if (node.children.length === 0) {
    return {
      width: boxW,
      height: boxH,
      centerX: boxW / 2,
      draw(x, y) {
        return drawBox(text, x, y, boxW, boxH, depth);
      },
    };
  }

  const childLayouts = node.children.map((c) => layoutNode(c, depth + 1));
  let childrenW = 0;
  for (let i = 0; i < childLayouts.length; i++) {
    childrenW += childLayouts[i]!.width;
    if (i < childLayouts.length - 1) childrenW += SIBLING_GAP;
  }
  const childrenMaxH = Math.max(...childLayouts.map((c) => c.height));

  const width = Math.max(boxW, childrenW);
  const height = boxH + LEVEL_GAP + childrenMaxH;
  const centerX = width / 2;

  return {
    width,
    height,
    centerX,
    draw(x, y) {
      const shapes: Shape[] = [];
      const boxX = x + centerX - boxW / 2;
      shapes.push(...drawBox(text, boxX, y, boxW, boxH, depth));

      const childY = y + boxH + LEVEL_GAP;
      const childrenStartX = x + (width - childrenW) / 2;
      const parentCx = x + centerX;
      const parentBottomY = y + boxH;
      const elbowY = (parentBottomY + childY) / 2;

      let cursorX = childrenStartX;
      for (const c of childLayouts) {
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

function drawBox(text: string, x: number, y: number, w: number, h: number, depth: number): Shape[] {
  const fill = LEVEL_FILLS[depth % LEVEL_FILLS.length]!;
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
      text,
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
