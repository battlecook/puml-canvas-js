import type { Participant } from '../../ast/sequence.js';
import type { Shape } from '../../scene/types.js';

export const HEADER_HEIGHT = 50;
const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 13;
const COLOR_FILL = '#fefece';
const COLOR_LINE = '#222';

export function drawHeader(p: Participant, cx: number, w: number, y: number): Shape[] {
  switch (p.shape) {
    case 'actor':       return headerActor(p.label, cx, y);
    case 'boundary':    return headerBoundary(p.label, cx, y);
    case 'control':     return headerControl(p.label, cx, y);
    case 'entity':      return headerEntity(p.label, cx, y);
    case 'database':    return headerDatabase(p.label, cx, w, y);
    case 'queue':       return headerQueue(p.label, cx, w, y);
    case 'collections': return headerCollections(p.label, cx, w, y);
    case 'participant': return headerParticipant(p.label, cx, w, y);
  }
}

function labelBelow(label: string, cx: number, y: number): Shape {
  return {
    type: 'text',
    x: cx,
    y: y + HEADER_HEIGHT - 5,
    text: label,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
  };
}

function labelCenter(label: string, cx: number, y: number, yOffset = 0): Shape {
  return {
    type: 'text',
    x: cx,
    y: y + HEADER_HEIGHT / 2 + yOffset,
    text: label,
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
  };
}

function headerParticipant(label: string, cx: number, w: number, y: number): Shape[] {
  return [
    {
      type: 'rect',
      x: cx - w / 2, y, w, h: HEADER_HEIGHT,
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    labelCenter(label, cx, y),
  ];
}

function headerActor(label: string, cx: number, y: number): Shape[] {
  const top = y + 4;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy: top + 5, r: 5, style: { fill: COLOR_FILL, ...stroke } },
    { type: 'line', x1: cx, y1: top + 10, x2: cx, y2: top + 24, style: stroke },
    { type: 'line', x1: cx - 9, y1: top + 16, x2: cx + 9, y2: top + 16, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx - 7, y2: top + 32, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx + 7, y2: top + 32, style: stroke },
    labelBelow(label, cx, y),
  ];
}

function headerBoundary(label: string, cx: number, y: number): Shape[] {
  const symbolCy = y + 16;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'line', x1: cx - 14, y1: symbolCy - 9, x2: cx - 14, y2: symbolCy + 9, style: stroke },
    { type: 'line', x1: cx - 14, y1: symbolCy, x2: cx - 7, y2: symbolCy, style: stroke },
    { type: 'circle', cx: cx + 2, cy: symbolCy, r: 9, style: { fill: COLOR_FILL, ...stroke } },
    labelBelow(label, cx, y),
  ];
}

function headerControl(label: string, cx: number, y: number): Shape[] {
  const cy = y + 16;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy, r: 10, style: { fill: COLOR_FILL, ...stroke } },
    {
      type: 'polyline',
      points: [[cx - 8, cy - 8], [cx - 3, cy - 8], [cx - 6, cy - 4]],
      style: { ...stroke, fill: 'none' },
    },
    labelBelow(label, cx, y),
  ];
}

function headerEntity(label: string, cx: number, y: number): Shape[] {
  const cy = y + 14;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy, r: 9, style: { fill: COLOR_FILL, ...stroke } },
    { type: 'line', x1: cx - 13, y1: cy + 11, x2: cx + 13, y2: cy + 11, style: stroke },
    labelBelow(label, cx, y),
  ];
}

function headerDatabase(label: string, cx: number, w: number, y: number): Shape[] {
  const left = cx - w / 2 + 4;
  const right = cx + w / 2 - 4;
  const top = y + 5;
  const bottom = y + HEADER_HEIGHT - 4;
  const rx = (right - left) / 2;
  const ry = 5;
  const midX = (left + right) / 2;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'path',
      d: `M ${left} ${top} L ${left} ${bottom} A ${rx} ${ry} 0 0 0 ${right} ${bottom} L ${right} ${top}`,
      style: { fill: COLOR_FILL, ...stroke },
    },
    { type: 'ellipse', cx: midX, cy: top, rx, ry, style: { fill: COLOR_FILL, ...stroke } },
    labelCenter(label, cx, y, 3),
  ];
}

function headerQueue(label: string, cx: number, w: number, y: number): Shape[] {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const ry = HEADER_HEIGHT / 2;
  const rx = 8;
  const midTop = y;
  const midBot = y + HEADER_HEIGHT;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'path',
      d:
        `M ${left + rx} ${midTop} L ${right - rx} ${midTop} ` +
        `A ${rx} ${ry} 0 0 1 ${right - rx} ${midBot} ` +
        `L ${left + rx} ${midBot} ` +
        `A ${rx} ${ry} 0 0 1 ${left + rx} ${midTop} Z`,
      style: { fill: COLOR_FILL, ...stroke },
    },
    {
      type: 'path',
      d: `M ${left + rx} ${midTop} A ${rx} ${ry} 0 0 0 ${left + rx} ${midBot}`,
      style: { fill: 'none', ...stroke },
    },
    labelCenter(label, cx, y),
  ];
}

function headerCollections(label: string, cx: number, w: number, y: number): Shape[] {
  const innerW = w - 4;
  const innerH = HEADER_HEIGHT - 4;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'rect',
      x: cx - innerW / 2 + 4, y, w: innerW, h: innerH,
      style: { fill: COLOR_FILL, ...stroke },
    },
    {
      type: 'rect',
      x: cx - innerW / 2, y: y + 4, w: innerW, h: innerH,
      style: { fill: COLOR_FILL, ...stroke },
    },
    {
      type: 'text',
      x: cx - 2,
      y: y + 4 + innerH / 2,
      text: label,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    },
  ];
}
