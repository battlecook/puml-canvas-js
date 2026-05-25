import type {
  ActivityAst,
  ActivityNode,
  ForkNode,
  IfNode,
  PartitionNode,
  RepeatNode,
  WhileNode,
} from '../../ast/activity.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;

const ACTION_PAD_X = 14;
const ACTION_PAD_Y = 8;
const ACTION_MIN_W = 80;
const DIAMOND_PAD_X = 16;
const DIAMOND_PAD_Y = 12;
const DIAMOND_MIN_W = 60;
const DIAMOND_MIN_H = 36;
const ARROW_GAP = 24;
const BRANCH_GAP = 32;
const FORK_BAR_H = 7;
const FORK_BAR_PAD = 16;
const START_R = 8;
const STOP_R = 10;
const LOOP_SIDE_GAP = 24;
const ARROW_HEAD = 6;
const EDGE_LABEL_PAD = 4;

const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 12;
const FONT_LABEL = 11;

const PARTITION_PAD_X = 14;
const PARTITION_PAD_TOP = 24;
const PARTITION_PAD_BOTTOM = 14;
const PARTITION_LABEL_FONT = 12;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_ACTION_FILL = '#dfe7ff';
const COLOR_DIAMOND_FILL = '#fefece';
const COLOR_BAR = '#222';
const COLOR_PARTITION_STROKE = '#888';
const COLOR_PARTITION_LABEL = '#444';

interface LayoutBox {
  width: number;
  height: number;
  inX: number;
  outX: number;
  draw(x: number, y: number): Shape[];
}

export function layoutActivity(ast: ActivityAst): Scene {
  const body = layoutSeq(ast.body);
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const totalW = body.width + PAGE_PAD * 2;
  const totalH = body.height + PAGE_PAD * 2 + titleHeight;

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
  children.push(...body.draw(PAGE_PAD, PAGE_PAD + titleHeight));

  return {
    width: Math.max(totalW, 200),
    height: Math.max(totalH, 80),
    background: '#fff',
    children,
  };
}

function layoutNode(node: ActivityNode): LayoutBox {
  switch (node.type) {
    case 'start':     return layoutStart();
    case 'stop':      return layoutStop();
    case 'end':       return layoutStop();
    case 'action':    return layoutAction(node.text);
    case 'if':        return layoutIf(node);
    case 'while':     return layoutWhile(node);
    case 'repeat':    return layoutRepeat(node);
    case 'fork':      return layoutFork(node);
    case 'detach':    return layoutTerminator('detach');
    case 'kill':      return layoutTerminator('kill');
    case 'break':     return layoutTerminator('break');
    case 'partition': return layoutPartition(node);
  }
}

function isTerminating(nodes: ActivityNode[]): boolean {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1]!;
  switch (last.type) {
    case 'stop':
    case 'end':
    case 'detach':
    case 'kill':
    case 'break':
      return true;
    default:
      return false;
  }
}

function layoutSeq(nodes: ActivityNode[]): LayoutBox {
  if (nodes.length === 0) {
    return { width: 0, height: 0, inX: 0, outX: 0, draw: () => [] };
  }
  const boxes = nodes.map(layoutNode);
  const centerline = Math.max(...boxes.map((b) => b.inX));
  let totalW = 0;
  for (const b of boxes) {
    const right = centerline - b.inX + b.width;
    if (right > totalW) totalW = right;
  }
  let totalH = 0;
  const placed: Array<{ box: LayoutBox; y: number }> = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (i > 0) totalH += ARROW_GAP;
    placed.push({ box: b, y: totalH });
    totalH += b.height;
  }
  return {
    width: totalW,
    height: totalH,
    inX: centerline,
    outX: centerline,
    draw(x, y) {
      const shapes: Shape[] = [];
      let prevBottom = -1;
      let prevOutX = centerline;
      for (const { box, y: dy } of placed) {
        const bx = x + centerline - box.inX;
        const by = y + dy;
        if (prevBottom >= 0) {
          shapes.push(...arrow(x + prevOutX, prevBottom, x + centerline, by));
        }
        shapes.push(...box.draw(bx, by));
        prevBottom = by + box.height;
        prevOutX = centerline;
      }
      return shapes;
    },
  };
}

function layoutAction(text: string): LayoutBox {
  const m = measureText(text, FONT_SIZE);
  const w = Math.max(ACTION_MIN_W, m.width + ACTION_PAD_X * 2);
  const h = m.height + ACTION_PAD_Y * 2;
  return {
    width: w,
    height: h,
    inX: w / 2,
    outX: w / 2,
    draw(x, y) {
      return [
        {
          type: 'rect',
          x, y, w, h,
          rx: 8, ry: 8,
          style: { fill: COLOR_ACTION_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
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
    },
  };
}

function layoutStart(): LayoutBox {
  const r = START_R;
  return {
    width: r * 2,
    height: r * 2,
    inX: r,
    outX: r,
    draw(x, y) {
      return [
        { type: 'circle', cx: x + r, cy: y + r, r, style: { fill: '#222', stroke: '#222', strokeWidth: 1 } },
      ];
    },
  };
}

function layoutStop(): LayoutBox {
  const r = STOP_R;
  return {
    width: r * 2,
    height: r * 2,
    inX: r,
    outX: r,
    draw(x, y) {
      return [
        { type: 'circle', cx: x + r, cy: y + r, r, style: { fill: '#fff', stroke: '#222', strokeWidth: 1.5 } },
        { type: 'circle', cx: x + r, cy: y + r, r: r - 4, style: { fill: '#222', stroke: '#222', strokeWidth: 1 } },
      ];
    },
  };
}

function layoutTerminator(kind: 'detach' | 'kill' | 'break'): LayoutBox {
  return {
    width: 16,
    height: 16,
    inX: 8,
    outX: 8,
    draw(x, y) {
      const cx = x + 8;
      const cy = y + 8;
      const stroke = { stroke: COLOR_LINE, strokeWidth: 1.5 };
      const shapes: Shape[] = [
        { type: 'line', x1: cx - 7, y1: cy - 7, x2: cx + 7, y2: cy + 7, style: stroke },
        { type: 'line', x1: cx - 7, y1: cy + 7, x2: cx + 7, y2: cy - 7, style: stroke },
      ];
      if (kind !== 'detach') {
        shapes.push({
          type: 'text',
          x: cx + 12,
          y: cy,
          text: kind,
          anchor: 'start',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#666' },
        });
      }
      return shapes;
    },
  };
}

function layoutPartition(node: PartitionNode): LayoutBox {
  const inner = layoutSeq(node.body);
  const labelW = node.name ? measureText(node.name, PARTITION_LABEL_FONT).width : 0;
  const minW = labelW + PARTITION_PAD_X * 2;
  const width = Math.max(inner.width + PARTITION_PAD_X * 2, minW, 80);
  const height = inner.height + PARTITION_PAD_TOP + PARTITION_PAD_BOTTOM;
  const innerOffsetX = (width - inner.width) / 2;
  return {
    width,
    height,
    inX: innerOffsetX + inner.inX,
    outX: innerOffsetX + inner.outX,
    draw(x, y) {
      const shapes: Shape[] = [
        {
          type: 'rect',
          x, y, w: width, h: height,
          rx: 4, ry: 4,
          style: { fill: 'none', stroke: COLOR_PARTITION_STROKE, strokeWidth: 1, strokeDasharray: '4,3' },
        },
      ];
      if (node.name) {
        shapes.push({
          type: 'text',
          x: x + PARTITION_PAD_X,
          y: y + PARTITION_PAD_TOP - 8,
          text: node.name,
          anchor: 'start',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: PARTITION_LABEL_FONT, weight: 'bold', color: COLOR_PARTITION_LABEL },
        });
      }
      shapes.push(...inner.draw(x + innerOffsetX, y + PARTITION_PAD_TOP));
      return shapes;
    },
  };
}

function diamondSize(text: string): { w: number; h: number } {
  const m = measureText(text, FONT_LABEL);
  return {
    w: Math.max(DIAMOND_MIN_W, m.width + DIAMOND_PAD_X * 2),
    h: Math.max(DIAMOND_MIN_H, m.height + DIAMOND_PAD_Y * 2),
  };
}

function drawDiamond(x: number, y: number, w: number, h: number, text: string): Shape[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return [
    {
      type: 'polygon',
      points: [
        [cx, y],
        [x + w, cy],
        [cx, y + h],
        [x, cy],
      ],
      style: { fill: COLOR_DIAMOND_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx, y: cy,
      text,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    },
  ];
}

function layoutIf(node: IfNode): LayoutBox {
  const branchList = [...node.branches];
  if (node.elseBranch) {
    branchList.push(node.elseBranch);
  } else {
    branchList.push({ label: '', body: [] });
  }
  const branchBoxes = branchList.map((b) => layoutSeq(b.body));
  const branchLabels = branchList.map((b) => splitLabel(b.label));

  const diamond = diamondSize(node.condition);

  let branchesW = 0;
  for (let i = 0; i < branchBoxes.length; i++) {
    branchesW += Math.max(branchBoxes[i]!.width, ACTION_MIN_W);
    if (i < branchBoxes.length - 1) branchesW += BRANCH_GAP;
  }
  const totalW = Math.max(branchesW, diamond.w);

  const centers: number[] = [];
  let cursorX = (totalW - branchesW) / 2;
  for (let i = 0; i < branchBoxes.length; i++) {
    const bw = Math.max(branchBoxes[i]!.width, ACTION_MIN_W);
    centers.push(cursorX + bw / 2);
    cursorX += bw + BRANCH_GAP;
  }

  const branchMaxH = Math.max(0, ...branchBoxes.map((b) => b.height));
  const mergeR = 6;
  const diamondCx = totalW / 2;
  const totalH = diamond.h + ARROW_GAP + branchMaxH + ARROW_GAP + mergeR * 2;

  return {
    width: totalW,
    height: totalH,
    inX: diamondCx,
    outX: diamondCx,
    draw(x, y) {
      const shapes: Shape[] = [];
      // Diamond
      const diamondX = x + diamondCx - diamond.w / 2;
      const diamondY = y;
      shapes.push(...drawDiamond(diamondX, diamondY, diamond.w, diamond.h, node.condition));

      const branchY = y + diamond.h + ARROW_GAP;
      const mergeY = branchY + branchMaxH + ARROW_GAP;
      const mergeCx = x + diamondCx;

      // For each branch: connect diamond to top of branch, then bottom of branch to merge.
      // Branch-exit arrows converge to the merge center (not straight down) so
      // off-center branches don't slide past the merge diamond.
      for (let i = 0; i < branchBoxes.length; i++) {
        const bbox = branchBoxes[i]!;
        const cx = x + centers[i]!;
        const top = branchY;
        const bottom = branchY + bbox.height;
        const terminates = isTerminating(branchList[i]!.body);

        if (bbox.width === 0) {
          if (!terminates) {
            shapes.push(...labeledArrow(
              x + diamondCx, diamondY + diamond.h,
              mergeCx, mergeY,
              branchLabels[i] ?? '',
            ));
          }
          continue;
        }

        shapes.push(
          ...labeledArrow(
            x + diamondCx, diamondY + diamond.h,
            cx, top,
            branchLabels[i] ?? '',
          ),
        );
        shapes.push(...bbox.draw(cx - bbox.inX, top));
        if (!terminates) {
          if (cx === mergeCx) {
            shapes.push(...arrow(cx, bottom, mergeCx, mergeY));
          } else {
            // Drop vertically out of the branch a little, then converge toward merge
            const bendY = mergeY - ARROW_GAP / 3;
            shapes.push(...polylineArrow([
              [cx, bottom],
              [cx, bendY],
              [mergeCx, mergeY],
            ]));
          }
        }
      }

      // Merge diamond (smaller)
      shapes.push(
        {
          type: 'polygon',
          points: [
            [mergeCx, mergeY],
            [mergeCx + mergeR, mergeY + mergeR],
            [mergeCx, mergeY + mergeR * 2],
            [mergeCx - mergeR, mergeY + mergeR],
          ],
          style: { fill: COLOR_DIAMOND_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
        },
      );

      return shapes;
    },
  };
}

function splitLabel(label: string): string {
  // for elseif we packed as "label|condition", show as: "label" if first part exists
  if (label.includes('|')) {
    const [primary, secondary] = label.split('|');
    return [primary, secondary].filter(Boolean).join(' / ');
  }
  return label;
}

function layoutWhile(node: WhileNode): LayoutBox {
  const body = layoutSeq(node.body);
  const diamond = diamondSize(node.condition);
  const sideGap = LOOP_SIDE_GAP;

  const innerW = Math.max(diamond.w, body.width);
  const totalW = innerW + sideGap;
  const cx = diamond.w / 2;
  const diamondX = (innerW - diamond.w) / 2;
  const bodyX = (innerW - body.width) / 2;

  const noExitW = sideGap;
  const totalH = diamond.h + ARROW_GAP + body.height + ARROW_GAP;

  return {
    width: totalW + noExitW,
    height: totalH,
    inX: diamondX + cx,
    outX: diamondX + cx,
    draw(x, y) {
      const shapes: Shape[] = [];
      const dx = x + diamondX;
      const dy = y;
      shapes.push(...drawDiamond(dx, dy, diamond.w, diamond.h, node.condition));

      // "yes" label + arrow from diamond bottom to body top
      const bodyTop = dy + diamond.h + ARROW_GAP;
      const bodyXAbs = x + bodyX;
      shapes.push(...labeledArrow(
        dx + diamond.w / 2, dy + diamond.h,
        bodyXAbs + body.inX, bodyTop,
        node.yesLabel || 'yes',
      ));
      shapes.push(...body.draw(bodyXAbs, bodyTop));

      // Loop back arrow from body bottom to diamond left side
      const bodyBot = bodyTop + body.height;
      const loopX = x + totalW;
      const diamondRight = dx + diamond.w;
      shapes.push(...polylineArrow([
        [bodyXAbs + body.outX, bodyBot],
        [loopX, bodyBot],
        [loopX, dy + diamond.h / 2],
        [diamondRight, dy + diamond.h / 2],
      ]));

      // "no" exit goes downward — we keep it virtual: layout's outX is centerline
      // so the parent sequence will draw arrow from outX (= centerline) down.
      // For "no" label visualization, add a small label on the right of diamond
      if (node.noLabel) {
        shapes.push({
          type: 'text',
          x: diamondRight + 4,
          y: dy + diamond.h / 2 - 4,
          text: node.noLabel,
          anchor: 'start',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
        });
      }

      return shapes;
    },
  };
}

function layoutRepeat(node: RepeatNode): LayoutBox {
  const body = layoutSeq(node.body);
  const diamond = diamondSize(node.condition || ' ');
  const sideGap = LOOP_SIDE_GAP;

  const innerW = Math.max(diamond.w, body.width);
  const totalW = innerW + sideGap;
  const cx = diamond.w / 2;
  const diamondX = (innerW - diamond.w) / 2;
  const bodyX = (innerW - body.width) / 2;

  const noExitW = sideGap;
  const totalH = body.height + ARROW_GAP + diamond.h;

  return {
    width: totalW + noExitW,
    height: totalH,
    inX: bodyX + body.inX,
    outX: diamondX + cx,
    draw(x, y) {
      const shapes: Shape[] = [];
      const bodyXAbs = x + bodyX;
      shapes.push(...body.draw(bodyXAbs, y));

      const diamondY = y + body.height + ARROW_GAP;
      const dx = x + diamondX;
      shapes.push(...drawDiamond(dx, diamondY, diamond.w, diamond.h, node.condition || '?'));

      // body bottom to diamond top
      shapes.push(...arrow(bodyXAbs + body.outX, y + body.height, dx + diamond.w / 2, diamondY));

      // loop back from diamond left to body top (via left side)
      const loopX = x + totalW;
      shapes.push(...polylineArrow([
        [dx + diamond.w, diamondY + diamond.h / 2],
        [loopX, diamondY + diamond.h / 2],
        [loopX, y - 4],
        [bodyXAbs + body.inX, y - 4],
        [bodyXAbs + body.inX, y],
      ]));

      // yes label near the back arrow start
      if (node.yesLabel) {
        shapes.push({
          type: 'text',
          x: dx + diamond.w + 4,
          y: diamondY + diamond.h / 2 - 4,
          text: node.yesLabel,
          anchor: 'start',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
        });
      }

      // no label near the downward exit arrow from diamond bottom
      if (node.noLabel) {
        shapes.push({
          type: 'text',
          x: dx + diamond.w / 2 + 4,
          y: diamondY + diamond.h + FONT_LABEL,
          text: node.noLabel,
          anchor: 'start',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
        });
      }

      return shapes;
    },
  };
}

function layoutFork(node: ForkNode): LayoutBox {
  const branches = node.branches.map(layoutSeq);
  let branchesW = 0;
  for (let i = 0; i < branches.length; i++) {
    branchesW += Math.max(branches[i]!.width, ACTION_MIN_W);
    if (i < branches.length - 1) branchesW += BRANCH_GAP;
  }
  const barW = branchesW + FORK_BAR_PAD * 2;
  const totalW = barW;

  const centers: number[] = [];
  let cursorX = FORK_BAR_PAD;
  for (let i = 0; i < branches.length; i++) {
    const bw = Math.max(branches[i]!.width, ACTION_MIN_W);
    centers.push(cursorX + bw / 2);
    cursorX += bw + BRANCH_GAP;
  }

  const branchMaxH = Math.max(0, ...branches.map((b) => b.height));
  const totalH = FORK_BAR_H + ARROW_GAP + branchMaxH + ARROW_GAP + FORK_BAR_H;
  const inOutX = totalW / 2;

  return {
    width: totalW,
    height: totalH,
    inX: inOutX,
    outX: inOutX,
    draw(x, y) {
      const shapes: Shape[] = [];

      // Top bar
      shapes.push({
        type: 'rect',
        x, y, w: barW, h: FORK_BAR_H,
        style: { fill: COLOR_BAR, stroke: COLOR_BAR, strokeWidth: 0 },
      });

      const branchY = y + FORK_BAR_H + ARROW_GAP;
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i]!;
        const cx = x + centers[i]!;
        const terminates = isTerminating(node.branches[i]!);
        shapes.push(...arrow(cx, y + FORK_BAR_H, cx, branchY));
        shapes.push(...b.draw(cx - b.inX, branchY));
        if (node.merge && !terminates) {
          shapes.push(...arrow(cx, branchY + b.height, cx, y + totalH - FORK_BAR_H));
        }
      }

      // Bottom bar
      if (node.merge) {
        shapes.push({
          type: 'rect',
          x, y: y + totalH - FORK_BAR_H,
          w: barW, h: FORK_BAR_H,
          style: { fill: COLOR_BAR, stroke: COLOR_BAR, strokeWidth: 0 },
        });
      }

      return shapes;
    },
  };
}

function arrow(x1: number, y1: number, x2: number, y2: number): Shape[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const ux = dx / len;
  const uy = dy / len;
  const tipX = x2;
  const tipY = y2;
  const baseX = tipX - ux * ARROW_HEAD;
  const baseY = tipY - uy * ARROW_HEAD;
  const px = -uy;
  const py = ux;
  return [
    { type: 'line', x1, y1, x2: tipX, y2: tipY, style: { stroke: COLOR_EDGE, strokeWidth: 1 } },
    {
      type: 'polygon',
      points: [
        [tipX, tipY],
        [baseX + px * (ARROW_HEAD / 2), baseY + py * (ARROW_HEAD / 2)],
        [baseX - px * (ARROW_HEAD / 2), baseY - py * (ARROW_HEAD / 2)],
      ],
      style: { fill: COLOR_EDGE, stroke: COLOR_EDGE, strokeWidth: 1 } as Style,
    },
  ];
}

function labeledArrow(x1: number, y1: number, x2: number, y2: number, label: string): Shape[] {
  const shapes = arrow(x1, y1, x2, y2);
  if (label) {
    shapes.push({
      type: 'text',
      x: (x1 + x2) / 2 + EDGE_LABEL_PAD,
      y: (y1 + y2) / 2,
      text: label,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    });
  }
  return shapes;
}

function polylineArrow(points: Array<[number, number]>): Shape[] {
  if (points.length < 2) return [];
  const shapes: Shape[] = [
    {
      type: 'polyline',
      points,
      style: { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' },
    },
  ];
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const tip = arrow(prev[0], prev[1], last[0], last[1]);
  // Just include the arrowhead polygon (skip duplicate line)
  for (const s of tip) {
    if (s.type === 'polygon') shapes.push(s);
  }
  return shapes;
}
