import type { Participant, ParticipantSection } from '../../ast/sequence.js';
import type { Shape } from '../../scene/types.js';
import { measureText } from './measure.js';

export const HEADER_HEIGHT_BASE = 50;
const FONT_FAMILY = 'sans-serif';
const FONT_MONO_FAMILY = 'monospace';
const FONT_SIZE = 13;
const FONT_BOLD = 14;
const LINE_HEIGHT = 16;
const BOLD_LINE_HEIGHT = 18;
const SECTION_DIVIDER_GAP = 6;
const SECTION_PAD_Y = 6;
const COLOR_FILL = '#fefece';
const COLOR_SECTIONED_FILL = '#e2e2f0';
const COLOR_LINE = '#222';

function sectionLineHeight(style: 'normal' | 'bold' | 'mono'): number {
  return style === 'bold' ? BOLD_LINE_HEIGHT : LINE_HEIGHT;
}

function sectionsHeight(sections: ParticipantSection[]): number {
  let h = 0;
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) h += SECTION_DIVIDER_GAP;
    h += SECTION_PAD_Y;
    for (const line of sections[i]!.lines) h += sectionLineHeight(line.style);
    h += SECTION_PAD_Y;
  }
  return h;
}

export function participantContentWidth(p: Participant): number {
  if (!p.sections || p.sections.length === 0) {
    return measureText(p.label, FONT_SIZE).width;
  }
  let w = 0;
  for (const sec of p.sections) {
    for (const line of sec.lines) {
      const font = line.style === 'bold' ? FONT_BOLD : FONT_SIZE;
      const m = measureText(line.text, font);
      if (m.width > w) w = m.width;
    }
  }
  return w;
}

/**
 * Height of a participant header given its label / sections.
 */
export function headerHeightFor(p: Participant): number {
  if (p.sections && p.sections.length > 0) {
    return Math.max(HEADER_HEIGHT_BASE, sectionsHeight(p.sections));
  }
  const lines = p.label.split('\n').length;
  if (lines <= 1) return HEADER_HEIGHT_BASE;
  return HEADER_HEIGHT_BASE + (lines - 1) * LINE_HEIGHT;
}

/** Returns the maximum header height across all participants in a diagram. */
export function maxHeaderHeight(parts: Participant[]): number {
  let h = HEADER_HEIGHT_BASE;
  for (const p of parts) h = Math.max(h, headerHeightFor(p));
  return h;
}

export function drawHeader(
  p: Participant,
  cx: number,
  w: number,
  y: number,
  headerHeight: number = HEADER_HEIGHT_BASE,
): Shape[] {
  if (p.sections && p.sections.length > 0) {
    return drawSectioned(p.sections, cx, w, y, p.color ?? COLOR_SECTIONED_FILL);
  }
  const fill = p.color ?? COLOR_FILL;
  switch (p.shape) {
    case 'actor':       return headerActor(p.label, cx, y, headerHeight, fill);
    case 'boundary':    return headerBoundary(p.label, cx, y, headerHeight, fill);
    case 'control':     return headerControl(p.label, cx, y, headerHeight, fill);
    case 'entity':      return headerEntity(p.label, cx, y, headerHeight, fill);
    case 'database':    return headerDatabase(p.label, cx, w, y, headerHeight, fill);
    case 'queue':       return headerQueue(p.label, cx, w, y, headerHeight, fill);
    case 'collections': return headerCollections(p.label, cx, w, y, headerHeight, fill);
    case 'participant': return headerParticipant(p.label, cx, w, y, headerHeight, fill);
  }
}

function labelLines(label: string): string[] {
  return label.split('\n');
}

function labelBelow(label: string, cx: number, y: number, headerHeight: number): Shape[] {
  const lines = labelLines(label);
  const total = lines.length * LINE_HEIGHT;
  const baseY = y + headerHeight - 5;
  return lines.map((line, i) => ({
    type: 'text',
    x: cx,
    y: baseY - (lines.length - 1 - i) * LINE_HEIGHT,
    text: line,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
  } as Shape)).slice(-Math.ceil(total / LINE_HEIGHT));
}

function labelCenter(label: string, cx: number, y: number, headerHeight: number, yOffset = 0): Shape[] {
  const lines = labelLines(label);
  const cy = y + headerHeight / 2 + yOffset;
  const startY = cy - ((lines.length - 1) * LINE_HEIGHT) / 2;
  return lines.map((line, i) => ({
    type: 'text',
    x: cx,
    y: startY + i * LINE_HEIGHT,
    text: line,
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
  } as Shape));
}

function drawSectioned(
  sections: ParticipantSection[],
  cx: number,
  w: number,
  y: number,
  fill: string,
): Shape[] {
  const totalH = sectionsHeight(sections);
  const left = cx - w / 2;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  const shapes: Shape[] = [
    {
      type: 'rect',
      x: left, y, w, h: totalH,
      style: { fill, ...stroke },
    },
  ];

  let cursorY = y;
  for (let s = 0; s < sections.length; s++) {
    if (s > 0) {
      shapes.push({
        type: 'line',
        x1: left, y1: cursorY, x2: left + w, y2: cursorY,
        style: { stroke: COLOR_LINE, strokeWidth: 1 },
      });
      cursorY += SECTION_DIVIDER_GAP;
    }
    cursorY += SECTION_PAD_Y;
    for (const line of sections[s]!.lines) {
      const lh = sectionLineHeight(line.style);
      const ty = cursorY + lh / 2;
      const isBold = line.style === 'bold';
      const isMono = line.style === 'mono';
      shapes.push({
        type: 'text',
        x: cx,
        y: ty,
        text: line.text,
        anchor: 'middle',
        baseline: 'middle',
        font: {
          family: isMono ? FONT_MONO_FAMILY : FONT_FAMILY,
          size: isBold ? FONT_BOLD : FONT_SIZE,
          weight: isBold ? 'bold' : 'normal',
          color: '#000',
        },
      });
      cursorY += lh;
    }
    cursorY += SECTION_PAD_Y;
  }
  return shapes;
}

function headerParticipant(label: string, cx: number, w: number, y: number, h: number, fill: string): Shape[] {
  return [
    {
      type: 'rect',
      x: cx - w / 2, y, w, h,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...labelCenter(label, cx, y, h),
  ];
}

function headerActor(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const top = y + 4;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy: top + 5, r: 5, style: { fill, ...stroke } },
    { type: 'line', x1: cx, y1: top + 10, x2: cx, y2: top + 24, style: stroke },
    { type: 'line', x1: cx - 9, y1: top + 16, x2: cx + 9, y2: top + 16, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx - 7, y2: top + 32, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx + 7, y2: top + 32, style: stroke },
    ...labelBelow(label, cx, y, h),
  ];
}

function headerBoundary(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const symbolCy = y + 16;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'line', x1: cx - 14, y1: symbolCy - 9, x2: cx - 14, y2: symbolCy + 9, style: stroke },
    { type: 'line', x1: cx - 14, y1: symbolCy, x2: cx - 7, y2: symbolCy, style: stroke },
    { type: 'circle', cx: cx + 2, cy: symbolCy, r: 9, style: { fill, ...stroke } },
    ...labelBelow(label, cx, y, h),
  ];
}

function headerControl(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const cy = y + 16;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy, r: 10, style: { fill, ...stroke } },
    {
      type: 'polyline',
      points: [[cx - 8, cy - 8], [cx - 3, cy - 8], [cx - 6, cy - 4]],
      style: { ...stroke, fill: 'none' },
    },
    ...labelBelow(label, cx, y, h),
  ];
}

function headerEntity(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const cy = y + 14;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy, r: 9, style: { fill, ...stroke } },
    { type: 'line', x1: cx - 13, y1: cy + 11, x2: cx + 13, y2: cy + 11, style: stroke },
    ...labelBelow(label, cx, y, h),
  ];
}

function headerDatabase(label: string, cx: number, w: number, y: number, h: number, fill: string): Shape[] {
  const left = cx - w / 2 + 4;
  const right = cx + w / 2 - 4;
  const top = y + 5;
  const bottom = y + h - 4;
  const rx = (right - left) / 2;
  const ry = 5;
  const midX = (left + right) / 2;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'path',
      d: `M ${left} ${top} L ${left} ${bottom} A ${rx} ${ry} 0 0 0 ${right} ${bottom} L ${right} ${top}`,
      style: { fill, ...stroke },
    },
    { type: 'ellipse', cx: midX, cy: top, rx, ry, style: { fill, ...stroke } },
    ...labelCenter(label, cx, y, h, 3),
  ];
}

function headerQueue(label: string, cx: number, w: number, y: number, h: number, fill: string): Shape[] {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const ry = h / 2;
  const rx = 8;
  const midTop = y;
  const midBot = y + h;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'path',
      d:
        `M ${left + rx} ${midTop} L ${right - rx} ${midTop} ` +
        `A ${rx} ${ry} 0 0 1 ${right - rx} ${midBot} ` +
        `L ${left + rx} ${midBot} ` +
        `A ${rx} ${ry} 0 0 1 ${left + rx} ${midTop} Z`,
      style: { fill, ...stroke },
    },
    {
      type: 'path',
      d: `M ${left + rx} ${midTop} A ${rx} ${ry} 0 0 0 ${left + rx} ${midBot}`,
      style: { fill: 'none', ...stroke },
    },
    ...labelCenter(label, cx, y, h),
  ];
}

function headerCollections(label: string, cx: number, w: number, y: number, h: number, fill: string): Shape[] {
  const innerW = w - 4;
  const innerH = h - 4;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    {
      type: 'rect',
      x: cx - innerW / 2 + 4, y, w: innerW, h: innerH,
      style: { fill, ...stroke },
    },
    {
      type: 'rect',
      x: cx - innerW / 2, y: y + 4, w: innerW, h: innerH,
      style: { fill, ...stroke },
    },
    ...labelCenter(label, cx - 2, y + 4, innerH),
  ];
}
