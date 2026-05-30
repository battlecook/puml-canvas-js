import type {
  TimingAst,
  TimingEvent,
  TimingTrack,
  TimingMeasurement,
} from '../../ast/timing.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const LABEL_FONT = 12;
const STATE_FONT = 11;
const AXIS_FONT = 10;
const NOTE_FONT = 10;
const LABEL_PAD_X = 10;
const TRACK_GAP = 12;
const ROBUST_H = 36;
const CONCISE_H = 28;
const BINARY_H = 36;
const ANALOG_H = 56;
const AXIS_H = 24;
const MIN_SEGMENT_PX = 60;
const MEASUREMENT_BAND_H = 18;
const FONT_FAMILY = 'sans-serif';

const COLOR_BG = '#fff';
const COLOR_LINE = '#333';
const COLOR_AXIS = '#888';
const COLOR_STATE_FILL = '#fff8dc';
const COLOR_CONCISE_FILL = '#e8f0ff';
const COLOR_BINARY = '#1f6feb';
const COLOR_LABEL = '#000';
const COLOR_TICK_LABEL = '#444';
const COLOR_NOTE = '#555';
const COLOR_MEASURE = '#555';
const COLOR_ANALOG = '#1f6feb';

export function layoutTiming(ast: TimingAst): Scene {
  if (ast.parseError) return errorScene(ast.parseError);
  if (ast.tracks.length === 0) {
    return emptyScene('(empty timing diagram)');
  }

  const timeSet = new Set<number>();
  for (const e of ast.events) timeSet.add(e.time);
  if (ast.measurements) {
    for (const m of ast.measurements) {
      timeSet.add(m.time1);
      timeSet.add(m.time2);
    }
  }
  if (timeSet.size === 0) {
    return emptyScene('(no @time events)');
  }
  const times = [...timeSet].sort((a, b) => a - b);
  const minT = times[0]!;
  const maxT = times[times.length - 1]!;

  const labelW = computeLabelColumnWidth(ast.tracks);
  const titleH = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const tracksH = ast.tracks.reduce((sum, t) => sum + laneHeight(t) + TRACK_GAP, 0);
  const totalLaneH = tracksH - TRACK_GAP;

  const span = Math.max(1, maxT - minT);
  const segments = Math.max(1, times.length - 1);
  const laneOriginX = PAGE_PAD + labelW + LABEL_PAD_X;
  // If a `scale N as M pixels` directive is set, pin the axis at a fixed
  // pixels-per-time-unit and let the diagram width follow. Otherwise use the
  // default linear fit (at least MIN_SEGMENT_PX per segment).
  let laneWidth: number;
  let xOfTime: (t: number) => number;
  if (ast.scale && ast.scale.units > 0 && ast.scale.pixels > 0) {
    const pxPerUnit = ast.scale.pixels / ast.scale.units;
    laneWidth = Math.max(1, span * pxPerUnit);
    xOfTime = (t: number): number => laneOriginX + (t - minT) * pxPerUnit;
  } else {
    laneWidth = Math.max(MIN_SEGMENT_PX * segments, 240);
    xOfTime = (t: number): number => laneOriginX + ((t - minT) / span) * laneWidth;
  }
  const totalW = laneOriginX + laneWidth + PAGE_PAD;
  const measurementBandH =
    ast.measurements && ast.measurements.length > 0 ? MEASUREMENT_BAND_H : 0;
  const axisRowH = ast.hideTimeAxis ? 0 : AXIS_H;
  const totalH =
    PAGE_PAD + titleH + measurementBandH + totalLaneH + axisRowH + PAGE_PAD;

  const shapes: Shape[] = [];

  if (ast.title) {
    shapes.push({
      type: 'text',
      x: totalW / 2,
      y: PAGE_PAD + TITLE_FONT,
      text: ast.title,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
    });
  }

  // Measurement band sits above the tracks.
  if (ast.measurements && ast.measurements.length > 0) {
    const bandY = PAGE_PAD + titleH + MEASUREMENT_BAND_H / 2;
    for (const m of ast.measurements) {
      shapes.push(...drawMeasurement(m, bandY, xOfTime));
    }
  }

  let cursorY = PAGE_PAD + titleH + measurementBandH;
  for (const track of ast.tracks) {
    const h = laneHeight(track);
    const trackEvents = ast.events.filter((e) => e.trackId === track.id);
    shapes.push(...drawLane(track, trackEvents, cursorY, h, laneOriginX, laneWidth, xOfTime, minT, maxT));
    shapes.push({
      type: 'text',
      x: PAGE_PAD + labelW,
      y: cursorY + h / 2,
      text: track.name,
      anchor: 'end',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: LABEL_FONT, weight: 'bold', color: COLOR_LABEL },
    });
    cursorY += h + TRACK_GAP;
  }

  if (!ast.hideTimeAxis) {
    const axisY = cursorY - TRACK_GAP + 6;
    shapes.push({
      type: 'line',
      x1: laneOriginX,
      y1: axisY,
      x2: laneOriginX + laneWidth,
      y2: axisY,
      style: { stroke: COLOR_AXIS, strokeWidth: 1 },
    });
    // `manual time-axis` keeps only the explicit event timestamps — which is
    // already the source of `times`. (We never insert auto-fill ticks here, so
    // the manual flag is effectively a guarantee no extras leak in.)
    const tickTimes = times;
    let lastLabelEnd = -Infinity;
    const TICK_LABEL_GAP = 4;
    for (const t of tickTimes) {
      const tx = xOfTime(t);
      shapes.push({
        type: 'line',
        x1: tx, y1: axisY, x2: tx, y2: axisY + 4,
        style: { stroke: COLOR_AXIS, strokeWidth: 1 },
      });
      const label = formatTickLabel(t, ast);
      const lw = measureText(label, AXIS_FONT).width;
      const labelLeft = tx - lw / 2;
      if (labelLeft < lastLabelEnd + TICK_LABEL_GAP) continue;
      shapes.push({
        type: 'text',
        x: tx,
        y: axisY + 6 + AXIS_FONT,
        text: label,
        anchor: 'middle',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: AXIS_FONT, color: COLOR_TICK_LABEL },
      });
      lastLabelEnd = labelLeft + lw;
    }
  }

  return {
    width: totalW,
    height: totalH,
    background: COLOR_BG,
    children: shapes,
  };
}

function formatTickLabel(t: number, ast: TimingAst): string {
  if (ast.domain === 'date') {
    const fmt = ast.dateFormat ?? 'YYYY-MM-dd';
    const d = new Date(t * 1000);
    return formatDate(d, fmt);
  }
  if (ast.domain === 'clock') {
    const total = Math.floor(t);
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  return String(t);
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Tiny date formatter for axis ticks.
 *
 * Supported tokens:
 *   YYYY  4-digit year  (e.g. 2001)
 *   YY    2-digit year  (e.g. 01)
 *   MMMM  full month name (January)
 *   MMM   short month name (Jan)
 *   MM    zero-padded month (01-12)
 *   M     month (1-12)
 *   dd    zero-padded day (01-31)
 *   d     day (1-31)
 *   HH    zero-padded hour (00-23)
 *   mm    zero-padded minute (00-59)
 *   ss    zero-padded second (00-59)
 * Anything else is passed through literally. Quote-runs are not supported.
 */
function formatDate(d: Date, fmt: string): string {
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const H = d.getUTCHours();
  const Mi = d.getUTCMinutes();
  const S = d.getUTCSeconds();
  // Process longest tokens first to avoid double-replacing.
  return fmt
    .replace(/YYYY/g, String(Y))
    .replace(/YY/g, pad2(Y % 100))
    .replace(/MMMM/g, MONTH_LONG[M - 1]!)
    .replace(/MMM/g, MONTH_SHORT[M - 1]!)
    .replace(/MM/g, pad2(M))
    .replace(/dd/g, pad2(D))
    .replace(/HH/g, pad2(H))
    .replace(/mm/g, pad2(Mi))
    .replace(/ss/g, pad2(S))
    // Single-letter tokens last and only where they don't collide with the
    // text already produced. Use a safer pass that won't touch digits we
    // just inserted: replace standalone occurrences.
    .replace(/\bM\b/g, String(M))
    .replace(/\bd\b/g, String(D));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function laneHeight(track: TimingTrack): number {
  switch (track.kind) {
    case 'robust': return ROBUST_H;
    case 'concise':
    case 'clock':
    // `rectangle` is a robust/concise hybrid in PlantUML: a labelled lane that
    // draws each state as a separate rectangle (like concise) but inherits
    // robust's row height so adjacent rectangle/robust tracks line up.
    case 'rectangle': return CONCISE_H;
    case 'binary': return BINARY_H;
    case 'analog': return ANALOG_H;
  }
}

function computeLabelColumnWidth(tracks: TimingTrack[]): number {
  let w = 60;
  for (const t of tracks) {
    const tw = measureText(t.name, LABEL_FONT).width;
    if (tw > w) w = tw;
  }
  return w + 4;
}

function drawLane(
  track: TimingTrack,
  events: TimingEvent[],
  y: number,
  h: number,
  laneX: number,
  laneW: number,
  xOf: (t: number) => number,
  minT: number,
  maxT: number,
): Shape[] {
  const shapes: Shape[] = [];
  shapes.push({
    type: 'line',
    x1: laneX, y1: y + h, x2: laneX + laneW, y2: y + h,
    style: { stroke: COLOR_AXIS, strokeWidth: 0.5, strokeDasharray: '2,2' },
  });

  if (track.kind === 'clock' && track.period && track.period > 0) {
    for (let t = minT; t <= maxT; t += track.period) {
      const tx = xOf(t);
      shapes.push({
        type: 'line',
        x1: tx, y1: y + 4, x2: tx, y2: y + h - 4,
        style: { stroke: COLOR_BINARY, strokeWidth: 1 },
      });
    }
  }

  if (events.length === 0) return shapes;

  if (track.kind === 'binary') {
    return [...shapes, ...drawBinary(events, y, h, xOf, maxT)];
  }
  if (track.kind === 'analog') {
    return [...shapes, ...drawAnalog(track, events, y, h, laneX, xOf)];
  }
  return [...shapes, ...drawStateLane(track, events, y, h, xOf, maxT)];
}

function drawStateLane(
  track: TimingTrack,
  events: TimingEvent[],
  y: number,
  h: number,
  xOf: (t: number) => number,
  maxT: number,
): Shape[] {
  const shapes: Shape[] = [];
  const fill = track.kind === 'concise' ? COLOR_CONCISE_FILL : COLOR_STATE_FILL;
  const top = y + 2;
  const boxH = h - 6;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const nextT = i + 1 < events.length ? events[i + 1]!.time : maxT;
    const x1 = xOf(e.time);
    const x2 = xOf(nextT);
    const w = Math.max(0, x2 - x1);
    if (w <= 0) continue;
    const stateText = String(e.state);
    const isHidden = stateText === '{hidden}';
    if (!isHidden) {
      shapes.push({
        type: 'rect',
        x: x1, y: top, w, h: boxH,
        style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
      });
      if (stateText) {
        const fitted = fitLabel(stateText, w - 6, STATE_FONT);
        if (fitted !== null) {
          shapes.push({
            type: 'text',
            x: x1 + w / 2,
            y: top + boxH / 2,
            text: fitted,
            anchor: 'middle',
            baseline: 'middle',
            font: { family: FONT_FAMILY, size: STATE_FONT, color: '#000' },
          });
        }
      }
    }
    // Inline note (`is state : note`) renders above the segment regardless
    // of whether the segment is hidden.
    if (e.note) {
      const noteFitted = fitLabel(e.note, Math.max(40, w - 4), NOTE_FONT) ?? e.note;
      shapes.push({
        type: 'text',
        x: x1 + w / 2,
        y: top - 2,
        text: noteFitted,
        anchor: 'middle',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: NOTE_FONT, style: 'italic', color: COLOR_NOTE },
      });
    }
  }
  return shapes;
}

function fitLabel(text: string, maxWidth: number, fontSize: number): string | null {
  if (text === '' || maxWidth <= 0) return null;
  const fullW = measureText(text, fontSize).width;
  if (fullW <= maxWidth) return text;
  const ellipsis = '…';
  const ellipsisW = measureText(ellipsis, fontSize).width;
  if (ellipsisW > maxWidth) return null;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const w = measureText(text.slice(0, mid) + ellipsis, fontSize).width;
    if (w <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  if (lo === 0) return null;
  return text.slice(0, lo) + ellipsis;
}

function drawBinary(
  events: TimingEvent[],
  y: number,
  h: number,
  xOf: (t: number) => number,
  maxT: number,
): Shape[] {
  const shapes: Shape[] = [];
  const highY = y + 4;
  const lowY = y + h - 4;
  let prevLevel: 'high' | 'low' | null = null;
  let prevX = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const level = binaryLevel(String(e.state));
    const nextT = i + 1 < events.length ? events[i + 1]!.time : maxT;
    const x1 = xOf(e.time);
    const x2 = xOf(nextT);
    const segY = level === 'high' ? highY : lowY;

    if (prevLevel !== null && prevLevel !== level) {
      shapes.push({
        type: 'line',
        x1: prevX, y1: prevLevel === 'high' ? highY : lowY,
        x2: prevX, y2: segY,
        style: { stroke: COLOR_BINARY, strokeWidth: 1.5 },
      });
    }
    shapes.push({
      type: 'line',
      x1, y1: segY, x2, y2: segY,
      style: { stroke: COLOR_BINARY, strokeWidth: 1.5 },
    });
    prevLevel = level;
    prevX = x2;
  }
  return shapes;
}

function drawAnalog(
  track: TimingTrack,
  events: TimingEvent[],
  y: number,
  h: number,
  laneX: number,
  xOf: (t: number) => number,
): Shape[] {
  const shapes: Shape[] = [];
  const top = y + 4;
  const bottom = y + h - 4;
  const laneH = bottom - top;

  // Numeric values, skipping anything that does not parse cleanly.
  const points: Array<[number, number]> = [];
  const values: number[] = [];
  for (const e of events) {
    const v = Number(e.state);
    if (!Number.isFinite(v)) continue;
    values.push(v);
  }
  if (values.length === 0) return shapes;

  // Y-range: explicit `between` from the AST wins; otherwise default to
  // 0..max(values) (the PlantUML "between 0-max (by default)" behavior).
  let yMin: number;
  let yMax: number;
  if (track.min !== undefined && track.max !== undefined) {
    yMin = track.min;
    yMax = track.max;
  } else {
    yMin = 0;
    yMax = Math.max(...values);
  }
  if (!(yMax > yMin)) {
    // Degenerate range — pad so we don't divide by zero. Centered single value.
    const c = yMax;
    yMin = c - 1;
    yMax = c + 1;
  }
  const yOf = (v: number): number => bottom - ((v - yMin) / (yMax - yMin)) * laneH;

  for (const e of events) {
    const v = Number(e.state);
    if (!Number.isFinite(v)) continue;
    points.push([xOf(e.time), yOf(v)]);
  }
  if (points.length === 0) return shapes;

  // Polyline through (x, y) sample points.
  shapes.push({
    type: 'polyline',
    points,
    style: { stroke: COLOR_ANALOG, strokeWidth: 1.5, fill: 'none' },
  });

  // Y-axis tick labels for min/max sit just left of the lane.
  shapes.push({
    type: 'text',
    x: laneX - 4,
    y: top,
    text: formatAxisNumber(yMax),
    anchor: 'end',
    baseline: 'hanging',
    font: { family: FONT_FAMILY, size: AXIS_FONT, color: COLOR_TICK_LABEL },
  });
  shapes.push({
    type: 'text',
    x: laneX - 4,
    y: bottom,
    text: formatAxisNumber(yMin),
    anchor: 'end',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: AXIS_FONT, color: COLOR_TICK_LABEL },
  });

  return shapes;
}

function formatAxisNumber(n: number): string {
  // Integer values render without a decimal; small fractions keep up to
  // 2 significant digits past the point for legibility.
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function binaryLevel(state: string): 'high' | 'low' {
  const s = state.trim().toLowerCase();
  if (s === 'high' || s === '1' || s === 'true' || s === 'on') return 'high';
  return 'low';
}

function drawMeasurement(
  m: TimingMeasurement,
  y: number,
  xOf: (t: number) => number,
): Shape[] {
  const shapes: Shape[] = [];
  const x1 = xOf(m.time1);
  const x2 = xOf(m.time2);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  if (right - left <= 0) return shapes;
  shapes.push({
    type: 'line',
    x1: left, y1: y, x2: right, y2: y,
    style: { stroke: COLOR_MEASURE, strokeWidth: 1 },
  });
  // Tiny arrowhead chevrons on both ends.
  const a = 4;
  shapes.push({
    type: 'polyline',
    points: [[left + a, y - 3], [left, y], [left + a, y + 3]],
    style: { stroke: COLOR_MEASURE, strokeWidth: 1 },
  });
  shapes.push({
    type: 'polyline',
    points: [[right - a, y - 3], [right, y], [right - a, y + 3]],
    style: { stroke: COLOR_MEASURE, strokeWidth: 1 },
  });
  if (m.label) {
    shapes.push({
      type: 'text',
      x: (left + right) / 2,
      y: y - 4,
      text: m.label,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: NOTE_FONT, color: COLOR_MEASURE },
    });
  }
  return shapes;
}

function emptyScene(message: string): Scene {
  const w = Math.max(240, message.length * 8 + 32);
  return {
    width: w,
    height: 60,
    background: COLOR_BG,
    children: [
      {
        type: 'text',
        x: w / 2, y: 30,
        text: message,
        anchor: 'middle', baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}

function errorScene(message: string): Scene {
  return {
    width: 480,
    height: 80,
    background: COLOR_BG,
    children: [
      {
        type: 'rect',
        x: 0.5, y: 0.5, w: 479, h: 79,
        style: { fill: '#fff5f5', stroke: '#c33', strokeWidth: 1 },
      },
      {
        type: 'text',
        x: 12, y: 24, text: 'Timing parse error',
        anchor: 'start', baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: 14, weight: 'bold', color: '#c33' },
      },
      {
        type: 'text',
        x: 12, y: 52, text: message.slice(0, 70),
        anchor: 'start', baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: 12, color: '#333' },
      },
    ],
  };
}
