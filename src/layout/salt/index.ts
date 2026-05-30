import type { SaltAst, SaltWidget } from '../../ast/salt.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 12;
const OUTER_PAD = 8;
const ROW_GAP = 6;
const ROW_H = 22;
const FONT_SIZE = 12;
const FONT_FAMILY = 'sans-serif';
const COLOR_LINE = '#444';
const COLOR_FILL = '#ffffff';
const COLOR_TEXT = '#222';
const COLOR_ACCENT = '#222';
const RADIO_R = 6;
const CHECK_S = 12;
const TEXTFIELD_PAD_X = 6;
const BUTTON_PAD_X = 12;
const DROPLIST_ARROW_W = 14;

/**
 * Lays out a Salt (wireframe) diagram as a vertical stack of widgets enclosed
 * in a thin outer border. Each widget renders on its own row at a uniform
 * height; widths are scaled to fit the widest widget so the column stays
 * aligned.
 */
export function layoutSalt(ast: SaltAst): Scene {
  const rows = ast.rows;
  if (rows.length === 0) {
    return emptyScene();
  }

  // Each widget reports a preferred width given its label/text. The container
  // grows to the widest preferred width so every row shares a single column.
  const widths = rows.map(preferredWidth);
  const contentW = Math.max(80, ...widths);

  const innerW = contentW;
  const innerH = rows.length * ROW_H + (rows.length - 1) * ROW_GAP;

  const outerW = innerW + OUTER_PAD * 2;
  const outerH = innerH + OUTER_PAD * 2;

  const sceneW = outerW + PAGE_PAD * 2;
  const sceneH = outerH + PAGE_PAD * 2;

  const children: Shape[] = [];

  // Outer container border. A thin rectangle around the whole wireframe.
  children.push({
    type: 'rect',
    x: PAGE_PAD + 0.5,
    y: PAGE_PAD + 0.5,
    w: outerW - 1,
    h: outerH - 1,
    style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
  });

  let y = PAGE_PAD + OUTER_PAD;
  const x0 = PAGE_PAD + OUTER_PAD;

  for (const widget of rows) {
    renderWidget(children, widget, x0, y, contentW);
    y += ROW_H + ROW_GAP;
  }

  return { width: sceneW, height: sceneH, background: '#ffffff', children };
}

function preferredWidth(w: SaltWidget): number {
  switch (w.kind) {
    case 'text':
      return measureText(w.text, FONT_SIZE).width + 4;
    case 'button':
      return measureText(w.label, FONT_SIZE).width + BUTTON_PAD_X * 2;
    case 'radio':
    case 'checkbox':
      return Math.max(RADIO_R * 2 + 4, CHECK_S + 4);
    case 'textfield':
      return Math.max(120, measureText(w.text, FONT_SIZE).width + TEXTFIELD_PAD_X * 2);
    case 'droplist':
      return Math.max(
        120,
        measureText(w.label, FONT_SIZE).width + TEXTFIELD_PAD_X * 2 + DROPLIST_ARROW_W,
      );
  }
}

function renderWidget(
  out: Shape[],
  w: SaltWidget,
  x: number,
  y: number,
  rowW: number,
): void {
  switch (w.kind) {
    case 'text':
      out.push({
        type: 'text',
        x,
        y: y + ROW_H / 2,
        text: w.text,
        anchor: 'start',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: COLOR_TEXT },
      });
      return;

    case 'button': {
      const bw = Math.min(
        rowW,
        measureText(w.label, FONT_SIZE).width + BUTTON_PAD_X * 2,
      );
      out.push({
        type: 'rect',
        x: x + 0.5,
        y: y + 0.5,
        w: bw - 1,
        h: ROW_H - 1,
        rx: 3,
        ry: 3,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: '#f2f2f2' },
      });
      out.push({
        type: 'text',
        x: x + bw / 2,
        y: y + ROW_H / 2,
        text: w.label,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: COLOR_TEXT },
      });
      return;
    }

    case 'radio': {
      const cx = x + RADIO_R + 1;
      const cy = y + ROW_H / 2;
      out.push({
        type: 'circle',
        cx,
        cy,
        r: RADIO_R,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
      });
      if (w.checked) {
        out.push({
          type: 'circle',
          cx,
          cy,
          r: RADIO_R - 3,
          style: { stroke: COLOR_ACCENT, strokeWidth: 0, fill: COLOR_ACCENT },
        });
      }
      return;
    }

    case 'checkbox': {
      const bx = x + 0.5;
      const by = y + (ROW_H - CHECK_S) / 2 + 0.5;
      out.push({
        type: 'rect',
        x: bx,
        y: by,
        w: CHECK_S - 1,
        h: CHECK_S - 1,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
      });
      if (w.checked) {
        // Two diagonal lines forming an X inside the box.
        out.push({
          type: 'line',
          x1: bx + 2,
          y1: by + 2,
          x2: bx + CHECK_S - 3,
          y2: by + CHECK_S - 3,
          style: { stroke: COLOR_ACCENT, strokeWidth: 1 },
        });
        out.push({
          type: 'line',
          x1: bx + CHECK_S - 3,
          y1: by + 2,
          x2: bx + 2,
          y2: by + CHECK_S - 3,
          style: { stroke: COLOR_ACCENT, strokeWidth: 1 },
        });
      }
      return;
    }

    case 'textfield': {
      out.push({
        type: 'rect',
        x: x + 0.5,
        y: y + 0.5,
        w: rowW - 1,
        h: ROW_H - 1,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
      });
      out.push({
        type: 'text',
        x: x + TEXTFIELD_PAD_X,
        y: y + ROW_H / 2,
        text: w.text,
        anchor: 'start',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: COLOR_TEXT },
      });
      return;
    }

    case 'droplist': {
      out.push({
        type: 'rect',
        x: x + 0.5,
        y: y + 0.5,
        w: rowW - 1,
        h: ROW_H - 1,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
      });
      out.push({
        type: 'text',
        x: x + TEXTFIELD_PAD_X,
        y: y + ROW_H / 2,
        text: w.label,
        anchor: 'start',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: COLOR_TEXT },
      });
      // Small downward triangle on the right edge.
      const ax = x + rowW - DROPLIST_ARROW_W / 2 - 4;
      const ay = y + ROW_H / 2;
      out.push({
        type: 'polygon',
        points: [
          [ax - 4, ay - 2],
          [ax + 4, ay - 2],
          [ax, ay + 3],
        ],
        style: { stroke: COLOR_ACCENT, strokeWidth: 0, fill: COLOR_ACCENT },
      });
      return;
    }
  }
}

function emptyScene(): Scene {
  const W = 120;
  const H = 40;
  return {
    width: W,
    height: H,
    background: '#ffffff',
    children: [
      {
        type: 'rect',
        x: 0.5,
        y: 0.5,
        w: W - 1,
        h: H - 1,
        style: { stroke: COLOR_LINE, strokeWidth: 1, fill: COLOR_FILL },
      },
      {
        type: 'text',
        x: W / 2,
        y: H / 2,
        text: '(empty salt diagram)',
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#888' },
      },
    ],
  };
}
