import type { MindmapAst, TreeNode } from '../../ast/tree.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const BOX_PAD_X = 12;
const BOX_PAD_Y = 6;
const BOX_MIN_W = 60;
const SIBLING_GAP = 10;
const LEVEL_GAP = 26;
const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 12;
const FONT_ROOT = 14;
const COLOR_LINE = '#222';
const COLOR_EDGE = '#666';

const LEVEL_FILLS = ['#fff3b0', '#cfe2ff', '#d6ecdb', '#fbd9d4', '#e4d4f4', '#ffe6cc'];

interface MmLayout {
  width: number;
  height: number;
  centerY: number;
  draw(x: number, y: number): Shape[];
}

export function layoutMindmap(ast: MindmapAst): Scene {
  if (!ast.root) return emptyScene();

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

function layoutNode(node: TreeNode, depth: number): MmLayout {
  const fontSize = depth === 0 ? FONT_ROOT : FONT_SIZE;
  const m = measureText(node.text, fontSize);
  const boxW = Math.max(BOX_MIN_W, m.width + BOX_PAD_X * 2);
  const boxH = m.height + BOX_PAD_Y * 2;

  if (node.children.length === 0) {
    return {
      width: boxW,
      height: boxH,
      centerY: boxH / 2,
      draw(x, y) {
        return drawBox(node.text, x, y, boxW, boxH, depth);
      },
    };
  }

  const childLayouts = node.children.map((c) => layoutNode(c, depth + 1));
  let childrenH = 0;
  for (let i = 0; i < childLayouts.length; i++) {
    childrenH += childLayouts[i]!.height;
    if (i < childLayouts.length - 1) childrenH += SIBLING_GAP;
  }
  const childrenMaxW = Math.max(...childLayouts.map((c) => c.width));

  const width = boxW + LEVEL_GAP + childrenMaxW;
  const height = Math.max(boxH, childrenH);
  const centerY = height / 2;

  return {
    width,
    height,
    centerY,
    draw(x, y) {
      const shapes: Shape[] = [];
      const boxY = y + centerY - boxH / 2;
      shapes.push(...drawBox(node.text, x, boxY, boxW, boxH, depth));

      const childX = x + boxW + LEVEL_GAP;
      const childrenStartY = y + (height - childrenH) / 2;
      const parentRightX = x + boxW;
      const parentCy = boxY + boxH / 2;
      const elbowX = (parentRightX + childX) / 2;

      let cursorY = childrenStartY;
      for (const c of childLayouts) {
        const childCy = cursorY + c.centerY;
        shapes.push({
          type: 'polyline',
          points: [
            [parentRightX, parentCy],
            [elbowX, parentCy],
            [elbowX, childCy],
            [childX, childCy],
          ],
          style: { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' },
        });
        shapes.push(...c.draw(childX, cursorY));
        cursorY += c.height + SIBLING_GAP;
      }
      return shapes;
    },
  };
}

function drawBox(text: string, x: number, y: number, w: number, h: number, depth: number): Shape[] {
  const fill = LEVEL_FILLS[depth % LEVEL_FILLS.length]!;
  const fontSize = depth === 0 ? FONT_ROOT : FONT_SIZE;
  const weight = depth === 0 ? 'bold' : 'normal';
  return [
    {
      type: 'rect',
      x, y, w, h,
      rx: h / 2, ry: h / 2,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: x + w / 2,
      y: y + h / 2,
      text,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: fontSize, weight, color: '#000' },
    },
  ];
}

function emptyScene(): Scene {
  return {
    width: 220,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 110, y: 30,
        text: '(empty mindmap)',
        anchor: 'middle', baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
