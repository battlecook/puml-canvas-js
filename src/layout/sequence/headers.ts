import type { Participant, ParticipantSection, ParticipantStereotype } from '../../ast/sequence.js';
import type { Shape, FontStyle } from '../../scene/types.js';
import { measureText } from './measure.js';
import { parseLabelMarkup, drawLabelSpans, measureSpansWidth } from './markup.js';
import { getSkin } from './skin.js';

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
const COLOR_LINE = '#222';

// Stereotype row above the participant name. The spot is a small filled circle
// (e.g. `(C,#ADD1B2)`); the label is rendered italic, wrapped in guillemets.
const STEREOTYPE_FONT_SIZE = 11;
const STEREOTYPE_LINE_HEIGHT = 14;
const STEREOTYPE_SPOT_RADIUS = 7;
const STEREOTYPE_SPOT_GAP = 4;
const STEREOTYPE_TOP_PAD = 4;

function stereoLabelText(st: ParticipantStereotype): string {
  return st.label ? `«${st.label}»` : '';
}

/** Width of the stereotype row (spot circle + optional «label») in pixels. */
function stereotypeRowWidth(st: ParticipantStereotype): number {
  const labelText = stereoLabelText(st);
  const labelW = labelText
    ? measureText(labelText, STEREOTYPE_FONT_SIZE).width
    : 0;
  const spotW = st.spot ? STEREOTYPE_SPOT_RADIUS * 2 : 0;
  if (spotW && labelW) return spotW + STEREOTYPE_SPOT_GAP + labelW;
  return spotW + labelW;
}

/** Vertical space added above the name by the stereotype row, if any. */
function stereotypeRowHeight(p: Participant): number {
  if (!p.stereotype) return 0;
  const hasContent = !!p.stereotype.spot || !!p.stereotype.label;
  if (!hasContent) return 0;
  return STEREOTYPE_LINE_HEIGHT + STEREOTYPE_TOP_PAD;
}

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
    // Width respects markup splits — each span measured individually.
    const lines = p.label.split('\n');
    let w = 0;
    for (const line of lines) {
      const sw = measureSpansWidth(parseLabelMarkup(line), FONT_SIZE);
      if (sw > w) w = sw;
    }
    if (p.stereotype) {
      const sw = stereotypeRowWidth(p.stereotype);
      if (sw > w) w = sw;
    }
    return w;
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
  let h = HEADER_HEIGHT_BASE;
  if (lines > 1) h += (lines - 1) * LINE_HEIGHT;
  h += stereotypeRowHeight(p);
  return h;
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
  const skin = getSkin();
  if (p.sections && p.sections.length > 0) {
    // Multi-line `participant Foo [ ... ]` uses the same default fill as a
    // single-line participant — PlantUML does not give the sectioned form a
    // distinct gray background. Per-participant `#color` and the
    // `participantBackgroundColor` skinparam still take precedence.
    const sectionedFill = p.color ?? skin.participantBackgroundColor ?? COLOR_FILL;
    return drawSectioned(p.sections, cx, w, y, sectionedFill);
  }
  // For actors, the explicit `actor X #color` directive still wins, but the
  // ambient skinparam fills in when no per-actor color was given.
  const isActor = p.shape === 'actor';
  const skinFill = isActor ? skin.actorBackgroundColor : skin.participantBackgroundColor;
  const fill = p.color ?? skinFill ?? COLOR_FILL;
  const stereoH = stereotypeRowHeight(p);
  let shapes: Shape[];
  switch (p.shape) {
    case 'actor':       shapes = headerActor(p.label, cx, y, headerHeight, fill); break;
    case 'boundary':    shapes = headerBoundary(p.label, cx, y, headerHeight, fill); break;
    case 'control':     shapes = headerControl(p.label, cx, y, headerHeight, fill); break;
    case 'entity':      shapes = headerEntity(p.label, cx, y, headerHeight, fill); break;
    case 'database':    shapes = headerDatabase(p.label, cx, w, y, headerHeight, fill); break;
    case 'queue':       shapes = headerQueue(p.label, cx, w, y, headerHeight, fill); break;
    case 'collections': shapes = headerCollections(p.label, cx, w, y, headerHeight, fill); break;
    case 'participant': shapes = headerParticipant(p.label, cx, w, y, headerHeight, fill, stereoH); break;
  }
  if (stereoH > 0 && p.stereotype) {
    shapes.push(...drawStereotypeRow(p.stereotype, cx, y, headerHeight, p.shape));
  }
  return shapes;
}

/** Stroke color for header outlines. Pulled from skinparam when present. */
function headerStroke(role: 'actor' | 'participant'): string {
  const skin = getSkin();
  const c = role === 'actor' ? skin.actorBorderColor : skin.participantBorderColor;
  return c ?? COLOR_LINE;
}

/** Resolves the FontStyle for participant/actor label text from skinparams. */
function labelFont(role: 'actor' | 'participant', baseSize: number, weight?: 'normal' | 'bold'): FontStyle {
  const skin = getSkin();
  const family = (role === 'actor' ? skin.actorFontName : skin.participantFontName) ?? FONT_FAMILY;
  const size = (role === 'actor' ? skin.actorFontSize : skin.participantFontSize) ?? baseSize;
  const color = (role === 'actor' ? skin.actorFontColor : skin.participantFontColor) ?? '#000';
  const f: FontStyle = { family, size, color };
  if (weight) f.weight = weight;
  return f;
}

/**
 * Draws the optional `<<...>>` row above (or near the top of) a participant's
 * header. For `participant` (rectangle), the row sits at the top of the rect,
 * pushing the name into the remaining space. For shape-headers (actor/etc.),
 * the row sits just above the label text below the icon.
 */
function drawStereotypeRow(
  st: ParticipantStereotype,
  cx: number,
  y: number,
  headerHeight: number,
  shape: Participant['shape'],
): Shape[] {
  const labelText = stereoLabelText(st);
  const labelW = labelText
    ? measureText(labelText, STEREOTYPE_FONT_SIZE).width
    : 0;
  const spotW = st.spot ? STEREOTYPE_SPOT_RADIUS * 2 : 0;
  const gap = spotW && labelW ? STEREOTYPE_SPOT_GAP : 0;
  const totalW = spotW + gap + labelW;
  // Stereotype row baseline. For participant (rectangle), it sits at the top.
  // For shape-headers, place it directly above the label (which is at y+h-5).
  const rowCenterY = shape === 'participant'
    ? y + STEREOTYPE_TOP_PAD + STEREOTYPE_LINE_HEIGHT / 2
    : y + headerHeight - 5 - LINE_HEIGHT - STEREOTYPE_LINE_HEIGHT / 2;
  const rowLeft = cx - totalW / 2;
  const out: Shape[] = [];
  let cursorX = rowLeft;
  if (st.spot) {
    out.push({
      type: 'circle',
      cx: cursorX + STEREOTYPE_SPOT_RADIUS,
      cy: rowCenterY,
      r: STEREOTYPE_SPOT_RADIUS,
      style: { fill: st.spot.color, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    out.push({
      type: 'text',
      x: cursorX + STEREOTYPE_SPOT_RADIUS,
      y: rowCenterY,
      text: st.spot.char,
      anchor: 'middle',
      baseline: 'middle',
      font: {
        family: FONT_MONO_FAMILY,
        size: STEREOTYPE_FONT_SIZE,
        weight: 'bold',
        color: '#000',
      },
    });
    cursorX += spotW + gap;
  }
  if (labelText) {
    out.push({
      type: 'text',
      x: cursorX,
      y: rowCenterY,
      text: labelText,
      anchor: 'start',
      baseline: 'middle',
      font: {
        family: FONT_FAMILY,
        size: STEREOTYPE_FONT_SIZE,
        style: 'italic',
        color: '#000',
      },
    });
  }
  return out;
}

function labelLines(label: string): string[] {
  return label.split('\n');
}

function labelBelow(label: string, cx: number, y: number, headerHeight: number, role: 'actor' | 'participant' = 'participant'): Shape[] {
  const lines = labelLines(label);
  const baseY = y + headerHeight - 5;
  const out: Shape[] = [];
  const font = labelFont(role, FONT_SIZE);
  for (let i = 0; i < lines.length; i++) {
    const spans = parseLabelMarkup(lines[i]!);
    const lineY = baseY - (lines.length - 1 - i) * LINE_HEIGHT;
    // Emit text directly to honour the skinparam font family / size / color.
    // `drawLabelSpans` would otherwise insert default sans-serif/black styling.
    if (spans.length === 1 && !spans[0]!.bold && !spans[0]!.italic && !spans[0]!.color) {
      out.push({
        type: 'text', x: cx, y: lineY, text: spans[0]!.text,
        anchor: 'middle', baseline: 'alphabetic', font,
      });
    } else {
      out.push(...drawLabelSpans(spans, cx, lineY, 'middle', 'alphabetic', font.size ?? FONT_SIZE));
    }
  }
  return out;
}

function labelCenter(label: string, cx: number, y: number, headerHeight: number, yOffset = 0, role: 'actor' | 'participant' = 'participant'): Shape[] {
  const lines = labelLines(label);
  const font = labelFont(role, FONT_SIZE);
  const lineH = Math.max(LINE_HEIGHT, (font.size ?? FONT_SIZE) + 4);
  const cy = y + headerHeight / 2 + yOffset;
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  const out: Shape[] = [];
  for (let i = 0; i < lines.length; i++) {
    const spans = parseLabelMarkup(lines[i]!);
    if (spans.length === 1 && !spans[0]!.bold && !spans[0]!.italic && !spans[0]!.color) {
      out.push({
        type: 'text', x: cx, y: startY + i * lineH, text: spans[0]!.text,
        anchor: 'middle', baseline: 'middle', font,
      });
    } else {
      out.push(...drawLabelSpans(spans, cx, startY + i * lineH, 'middle', 'middle', font.size ?? FONT_SIZE));
    }
  }
  return out;
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

function headerParticipant(
  label: string,
  cx: number,
  w: number,
  y: number,
  h: number,
  fill: string,
  stereoH: number = 0,
): Shape[] {
  // Center the name in the area below the stereotype row (if present).
  const nameAreaY = y + stereoH;
  const nameAreaH = h - stereoH;
  const stroke = headerStroke('participant');
  return [
    {
      type: 'rect',
      x: cx - w / 2, y, w, h,
      style: { fill, stroke, strokeWidth: 1 },
    },
    ...labelCenter(label, cx, nameAreaY, nameAreaH, 0, 'participant'),
  ];
}

function headerActor(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const skin = getSkin();
  const style = skin.actorStyle;
  if (style === 'awesome') return headerActorAwesome(label, cx, y, h, fill);
  if (style === 'hollow') return headerActorHollow(label, cx, y, h);
  const top = y + 4;
  const strokeColor = headerStroke('actor');
  const stroke = { stroke: strokeColor, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy: top + 5, r: 5, style: { fill, ...stroke } },
    { type: 'line', x1: cx, y1: top + 10, x2: cx, y2: top + 24, style: stroke },
    { type: 'line', x1: cx - 9, y1: top + 16, x2: cx + 9, y2: top + 16, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx - 7, y2: top + 32, style: stroke },
    { type: 'line', x1: cx, y1: top + 24, x2: cx + 7, y2: top + 32, style: stroke },
    ...labelBelow(label, cx, y, h, 'actor'),
  ];
}

/** Awesome silhouette variant of the sequence-header actor: filled head circle
 * over a rounded-top torso rect. Geometry is scaled down (relative to the
 * use-case version) to fit inside the existing 32px header symbol band so the
 * header height math is unchanged. */
function headerActorAwesome(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const top = y + 4;
  const headR = 5;
  const headCy = top + headR;
  const torsoW = 14;
  const torsoH = 12;
  const torsoX = cx - torsoW / 2;
  const torsoY = headCy + headR - 1;
  const skin = getSkin();
  const strokeColor = skin.actorBorderColor ?? '#888';
  const fillColor = skin.actorBackgroundColor ?? fill ?? '#E0E0E0';
  const style = { fill: fillColor, stroke: strokeColor, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy: headCy, r: headR, style },
    {
      type: 'rect',
      x: torsoX,
      y: torsoY,
      w: torsoW,
      h: torsoH,
      rx: torsoW / 2,
      ry: torsoW / 2,
      style,
    },
    ...labelBelow(label, cx, y, h, 'actor'),
  ];
}

/** Hollow silhouette variant: a stylized "person" icon — a small round head
 * over a rounded dome-shaped torso (shoulders rising into raised-arm curves),
 * with two short leg strokes below. White interior with a gray outline. */
function headerActorHollow(label: string, cx: number, y: number, h: number): Shape[] {
  const top = y + 4;
  const strokeColor = headerStroke('actor');
  const stroke = { stroke: strokeColor, strokeWidth: 1.5 };
  const fillStroke = { fill: '#FFFFFF', ...stroke };

  // Head: a slightly larger circle than the stickman for the silhouette look.
  const headR = 6;
  const headCy = top + headR;

  // Torso/shoulders polygon: a rounded dome that flares outward at the
  // shoulders. Coordinates trace (left-arm-out, up to neck, over to
  // right-arm-out, down to right hip, across to left hip, back to start).
  const shoulderY = headCy + headR + 1;
  const hipY = top + 26;
  const torsoHalf = 10;
  const neckHalf = 3;
  const hipHalf = 6;

  // Body polygon — 6 corners, a "person silhouette" torso with shoulders and
  // a tapered waist.
  const torso: Shape = {
    type: 'polygon',
    points: [
      [cx - torsoHalf, shoulderY + 3], // left shoulder/arm tip
      [cx - neckHalf, shoulderY],      // left neck
      [cx + neckHalf, shoulderY],      // right neck
      [cx + torsoHalf, shoulderY + 3], // right shoulder/arm tip
      [cx + hipHalf, hipY],            // right hip
      [cx - hipHalf, hipY],            // left hip
    ],
    style: fillStroke,
  };

  // Two short leg strokes below the hips.
  const legBottom = top + 32;
  return [
    { type: 'circle', cx, cy: headCy, r: headR, style: fillStroke },
    torso,
    { type: 'line', x1: cx - 4, y1: hipY, x2: cx - 5, y2: legBottom, style: stroke },
    { type: 'line', x1: cx + 4, y1: hipY, x2: cx + 5, y2: legBottom, style: stroke },
    ...labelBelow(label, cx, y, h, 'actor'),
  ];
}

function headerBoundary(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const symbolCy = y + 16;
  const strokeColor = headerStroke('participant');
  const stroke = { stroke: strokeColor, strokeWidth: 1 };
  return [
    { type: 'line', x1: cx - 14, y1: symbolCy - 9, x2: cx - 14, y2: symbolCy + 9, style: stroke },
    { type: 'line', x1: cx - 14, y1: symbolCy, x2: cx - 7, y2: symbolCy, style: stroke },
    { type: 'circle', cx: cx + 2, cy: symbolCy, r: 9, style: { fill, ...stroke } },
    ...labelBelow(label, cx, y, h),
  ];
}

function headerControl(label: string, cx: number, y: number, h: number, fill: string): Shape[] {
  const cy = y + 16;
  const strokeColor = headerStroke('participant');
  const stroke = { stroke: strokeColor, strokeWidth: 1 };
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
  const strokeColor = headerStroke('participant');
  const stroke = { stroke: strokeColor, strokeWidth: 1 };
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
  const stroke = { stroke: headerStroke('participant'), strokeWidth: 1 };
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
  const stroke = { stroke: headerStroke('participant'), strokeWidth: 1 };
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
  const stroke = { stroke: headerStroke('participant'), strokeWidth: 1 };
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
