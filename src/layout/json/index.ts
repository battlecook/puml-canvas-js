import type { JsonAst } from '../../ast/json.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const KEY_FONT = 12;
const VALUE_FONT = 12;
const ROW_PAD_X = 10;
const ROW_PAD_Y = 6;
const ROW_MIN_H = 22;
const COLUMN_GAP = 80;
const NODE_GAP = 24;
const CONNECTOR_R = 4;
const FONT_FAMILY = 'sans-serif';

const COLOR_LINE = '#444';
const COLOR_CELL_FILL = '#ffffff';
const COLOR_KEY_FILL = '#f6f6f6';
const COLOR_HIGHLIGHT = '#d6f0c8';
const COLOR_EDGE = '#666';
const COLOR_DOT = '#222';
const COLOR_STRING = '#0a7c2e';
const COLOR_NUMBER = '#0356a4';
const COLOR_BOOLEAN = '#a05500';
const COLOR_NULL = '#999';

type Primitive = string | number | boolean | null;

/** Visual overrides applied to a highlighted row. Sourced from a `<style>`
 * class (`<<className>>`) or defaulted to the plain green fill. */
interface HighlightStyle {
  fill?: string;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
}

interface Row {
  key: string;
  isPrimitive: boolean;
  primitiveText: string;
  primitiveColor: string;
  childId: string;
  highlighted: boolean;
  highlightStyle?: HighlightStyle;
}

interface NodeBox {
  id: string;
  rows: Row[];
  keyW: number;
  valW: number;
  rowH: number;
}

interface Edge {
  fromId: string;
  fromRowIdx: number;
  toId: string;
}

interface Graph {
  nodes: NodeBox[];
  rootId: string;
  edges: Edge[];
  depth: Map<string, number>;
  isArray: Map<string, boolean>;
}

export function layoutJson(ast: JsonAst): Scene {
  return layoutKvTree({
    title: ast.title,
    data: ast.data,
    highlights: ast.highlights,
    highlightClassNames: ast.highlightClassNames,
    classStyles: ast.styles,
    parseError: ast.parseError,
    errorLabel: 'JSON parse error',
  });
}

export interface KvNodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  rx?: number;
  ry?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontColor?: string;
}

export interface KvEdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export interface KvSeparatorStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export interface KvStyling {
  node?: KvNodeStyle;
  arrow?: KvEdgeStyle;
  separator?: KvSeparatorStyle;
}

export interface KvTreeInput {
  title: string;
  data: unknown;
  highlights: string[][];
  /** Optional parallel array of class names referenced by each highlight (e.g.
   * `<<h1>>` after the path). Length should match `highlights` when supplied. */
  highlightClassNames?: Array<string | undefined>;
  /** CSS-like class table from a `<style>` block: className -> property map
   * (property keys lowercased). Used to resolve `<<className>>` references. */
  classStyles?: Record<string, Record<string, string>>;
  parseError: string;
  errorLabel: string;
  styling?: KvStyling;
}

export function layoutKvTree(ast: KvTreeInput): Scene {
  if (ast.parseError) {
    return errorScene(ast.parseError, ast.errorLabel);
  }

  // Resolve `<style>` class properties into per-row visual overrides. Key
  // strings mirror `path.join('')` for backwards-compat with prior matching.
  const highlightStyleMap = new Map<string, HighlightStyle>();
  for (let i = 0; i < ast.highlights.length; i++) {
    const path = ast.highlights[i]!;
    const key = path.join('');
    const className = ast.highlightClassNames?.[i];
    const props = className ? ast.classStyles?.[className] : undefined;
    highlightStyleMap.set(key, resolveHighlightStyle(props));
  }
  const highlightSet = new Set(highlightStyleMap.keys());
  const graph = buildGraph(ast.data, highlightSet, highlightStyleMap);

  if (graph.nodes.length === 0) {
    return scalarOnly(ast);
  }

  // Group nodes by depth (columns)
  const columns: NodeBox[][] = [];
  for (const node of graph.nodes) {
    const d = graph.depth.get(node.id) ?? 0;
    while (columns.length <= d) columns.push([]);
    columns[d]!.push(node);
  }

  const columnWidths = columns.map((col) =>
    col.length === 0 ? 0 : Math.max(...col.map((n) => n.keyW + n.valW)),
  );

  // Position columns horizontally
  const colX: number[] = [];
  let cursorX = PAGE_PAD;
  for (let c = 0; c < columns.length; c++) {
    colX.push(cursorX);
    cursorX += columnWidths[c]! + COLUMN_GAP;
  }
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const totalW = cursorX - COLUMN_GAP + PAGE_PAD;

  // Position nodes within each column (stack vertically)
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  let maxColEnd = PAGE_PAD + titleHeight;
  for (let c = 0; c < columns.length; c++) {
    let cy = PAGE_PAD + titleHeight;
    for (const node of columns[c]!) {
      const w = node.keyW + node.valW;
      const h = node.rows.length * node.rowH;
      positions.set(node.id, { x: colX[c]!, y: cy, w, h });
      cy += h + NODE_GAP;
    }
    if (cy > maxColEnd) maxColEnd = cy;
  }
  const totalH = maxColEnd - NODE_GAP + PAGE_PAD;

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

  // Draw edges first so node fills cover them at endpoints
  const arrowStyle = ast.styling?.arrow;
  for (const edge of graph.edges) {
    const fromPos = positions.get(edge.fromId);
    const toPos = positions.get(edge.toId);
    if (!fromPos || !toPos) continue;
    const fromNode = graph.nodes.find((n) => n.id === edge.fromId)!;
    const dotX = fromPos.x + fromNode.keyW + fromNode.valW - ROW_PAD_X;
    const dotY = fromPos.y + edge.fromRowIdx * fromNode.rowH + fromNode.rowH / 2;
    const targetX = toPos.x;
    const targetY = toPos.y + toPos.h / 2;
    shapes.push({
      type: 'line',
      x1: dotX,
      y1: dotY,
      x2: targetX,
      y2: targetY,
      style: {
        stroke: arrowStyle?.stroke ?? COLOR_EDGE,
        strokeWidth: arrowStyle?.strokeWidth ?? 1,
        strokeDasharray: arrowStyle?.strokeDasharray ?? '4,3',
      },
    });
  }

  // Draw nodes
  for (const node of graph.nodes) {
    const pos = positions.get(node.id)!;
    shapes.push(...drawNode(node, pos.x, pos.y, ast.styling));
  }

  return {
    width: Math.max(totalW, 240),
    height: Math.max(totalH, 60),
    background: '#fff',
    children: shapes,
  };
}

function buildGraph(
  data: unknown,
  highlights: Set<string>,
  highlightStyles: Map<string, HighlightStyle>,
): Graph {
  const nodes: NodeBox[] = [];
  const edges: Edge[] = [];
  const depth = new Map<string, number>();
  const isArray = new Map<string, boolean>();
  let counter = 0;

  function walk(value: unknown, path: string[], d: number): string | null {
    if (!isComposite(value)) return null;
    const id = `n${counter++}`;
    depth.set(id, d);
    const arrFlag = Array.isArray(value);
    isArray.set(id, arrFlag);

    const entries: Array<[string, unknown]> = arrFlag
      ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(value as Record<string, unknown>);

    const rows: Row[] = entries.map(([key, v]) => {
      const childPath = [...path, key];
      const pathKey = childPath.join('');
      const highlighted = highlights.has(pathKey);
      const hs = highlighted ? highlightStyles.get(pathKey) : undefined;
      const base: Row = isComposite(v)
        ? {
            key,
            isPrimitive: false,
            primitiveText: '',
            primitiveColor: '',
            childId: '',
            highlighted,
          }
        : (() => {
            const formatted = formatPrimitive(v as Primitive);
            return {
              key,
              isPrimitive: true,
              primitiveText: formatted.text,
              primitiveColor: formatted.color,
              childId: '',
              highlighted,
            };
          })();
      if (hs) base.highlightStyle = hs;
      return base;
    });

    // Measure
    const keyMaxW = Math.max(
      0,
      ...rows.map((r) => measureText(r.key, KEY_FONT).width),
    ) + ROW_PAD_X * 2;
    const valMaxW = Math.max(
      40,
      ...rows.map((r) =>
        r.isPrimitive
          ? measureText(r.primitiveText, VALUE_FONT).width + ROW_PAD_X * 2
          : ROW_PAD_X * 2 + CONNECTOR_R * 2,
      ),
    );
    const rowH = Math.max(
      ROW_MIN_H,
      measureText('Mg', KEY_FONT).height + ROW_PAD_Y * 2,
    );

    const node: NodeBox = { id, rows, keyW: keyMaxW, valW: valMaxW, rowH };
    nodes.push(node);

    // Recurse and create edges + assign childIds
    for (let i = 0; i < entries.length; i++) {
      const [key, v] = entries[i]!;
      if (isComposite(v)) {
        const childId = walk(v, [...path, key], d + 1);
        if (childId) {
          rows[i]!.childId = childId;
          edges.push({ fromId: id, fromRowIdx: i, toId: childId });
        }
      }
    }

    return id;
  }

  const rootId = walk(data, [], 0) ?? '';
  return { nodes, rootId, edges, depth, isArray };
}

function drawNode(node: NodeBox, x: number, y: number, styling?: KvStyling): Shape[] {
  const shapes: Shape[] = [];
  const w = node.keyW + node.valW;
  const totalH = node.rows.length * node.rowH;
  const ns = styling?.node;
  const sepS = styling?.separator;

  const nodeStroke = ns?.stroke ?? COLOR_LINE;
  const nodeStrokeWidth = ns?.strokeWidth ?? 1;
  const nodeDash = ns?.strokeDasharray;
  const nodeFill = ns?.fill;
  const keyFill = nodeFill ?? COLOR_KEY_FILL;
  const valueDefaultFill = nodeFill ?? COLOR_CELL_FILL;
  const rx = ns?.rx;
  const ry = ns?.ry;
  const textFamily = ns?.fontFamily ?? FONT_FAMILY;
  const textSize = ns?.fontSize ?? KEY_FONT;
  const textWeight = ns?.fontWeight ?? 'bold';
  const textColor = ns?.fontColor ?? '#000';
  const valueFamily = ns?.fontFamily ?? FONT_FAMILY;
  const valueSize = ns?.fontSize ?? VALUE_FONT;
  // When the node font color is explicit, use it for primitive values too
  // (overriding the per-type syntax color).
  const valueColorOverride = ns?.fontColor;

  // When the user supplies a node style, render the box as one outlined rect
  // covering all rows, then draw row separators using the separator style.
  // Otherwise keep the per-cell rect grid for backwards compatibility.
  const styled = ns !== undefined;

  if (styled) {
    const outerRect: Shape = {
      type: 'rect',
      x,
      y,
      w,
      h: totalH,
      style: {
        fill: nodeFill ?? COLOR_CELL_FILL,
        stroke: nodeStroke,
        strokeWidth: nodeStrokeWidth,
        ...(nodeDash ? { strokeDasharray: nodeDash } : {}),
      },
    };
    if (rx !== undefined) (outerRect as { rx?: number }).rx = rx;
    if (ry !== undefined) (outerRect as { ry?: number }).ry = ry;
    shapes.push(outerRect);
  }

  for (let i = 0; i < node.rows.length; i++) {
    const row = node.rows[i]!;
    const rowY = y + i * node.rowH;
    // Per-row highlight: explicit class fill > default highlight color.
    const hi = row.highlightStyle;
    const highlightFill = row.highlighted
      ? (hi?.fill ?? COLOR_HIGHLIGHT)
      : valueDefaultFill;

    if (!styled) {
      // Preserve the original shape ordering: key-rect, key-text, value-rect, value-text/dot.
      shapes.push({
        type: 'rect',
        x,
        y: rowY,
        w: node.keyW,
        h: node.rowH,
        style: { fill: keyFill, stroke: nodeStroke, strokeWidth: nodeStrokeWidth },
      });
      shapes.push({
        type: 'text',
        x: x + ROW_PAD_X,
        y: rowY + node.rowH / 2,
        text: row.key,
        anchor: 'start',
        baseline: 'middle',
        font: { family: textFamily, size: textSize, weight: textWeight, color: textColor },
      });
      shapes.push({
        type: 'rect',
        x: x + node.keyW,
        y: rowY,
        w: node.valW,
        h: node.rowH,
        style: { fill: highlightFill, stroke: nodeStroke, strokeWidth: nodeStrokeWidth },
      });
      if (row.isPrimitive) {
        const valueColor = hi?.fontColor ?? row.primitiveColor;
        const font: { family: string; size: number; weight?: 'bold' | 'normal'; style?: 'italic' | 'normal'; color: string } = {
          family: valueFamily,
          size: valueSize,
          color: valueColor,
        };
        if (hi?.fontWeight) font.weight = hi.fontWeight;
        if (hi?.fontStyle) font.style = hi.fontStyle;
        shapes.push({
          type: 'text',
          x: x + node.keyW + ROW_PAD_X,
          y: rowY + node.rowH / 2,
          text: row.primitiveText,
          anchor: 'start',
          baseline: 'middle',
          font,
        });
      } else {
        const dotX = x + w - ROW_PAD_X;
        const dotY = rowY + node.rowH / 2;
        shapes.push({
          type: 'circle',
          cx: dotX,
          cy: dotY,
          r: CONNECTOR_R,
          style: { fill: COLOR_DOT, stroke: COLOR_DOT, strokeWidth: 1 },
        });
      }
      continue;
    }

    // Styled path: outer rect drawn above; per-row only overlays + text.
    if (row.highlighted) {
      shapes.push({
        type: 'rect',
        x: x + node.keyW,
        y: rowY,
        w: node.valW,
        h: node.rowH,
        style: { fill: highlightFill },
      });
    }
    shapes.push({
      type: 'text',
      x: x + ROW_PAD_X,
      y: rowY + node.rowH / 2,
      text: row.key,
      anchor: 'start',
      baseline: 'middle',
      font: { family: textFamily, size: textSize, weight: textWeight, color: textColor },
    });
    if (row.isPrimitive) {
      const valueColor = hi?.fontColor ?? valueColorOverride ?? row.primitiveColor;
      const weight: 'bold' | undefined =
        hi?.fontWeight === 'bold' ? 'bold' : textWeight === 'bold' ? 'bold' : undefined;
      const styleField: 'italic' | undefined = hi?.fontStyle === 'italic' ? 'italic' : undefined;
      const font: { family: string; size: number; weight?: 'bold' | 'normal'; style?: 'italic' | 'normal'; color: string } = {
        family: valueFamily,
        size: valueSize,
        color: valueColor,
      };
      if (weight) font.weight = weight;
      if (styleField) font.style = styleField;
      shapes.push({
        type: 'text',
        x: x + node.keyW + ROW_PAD_X,
        y: rowY + node.rowH / 2,
        text: row.primitiveText,
        anchor: 'start',
        baseline: 'middle',
        font,
      });
    } else {
      const dotX = x + w - ROW_PAD_X;
      const dotY = rowY + node.rowH / 2;
      shapes.push({
        type: 'circle',
        cx: dotX,
        cy: dotY,
        r: CONNECTOR_R,
        style: { fill: COLOR_DOT, stroke: COLOR_DOT, strokeWidth: 1 },
      });
    }

    if (i > 0) {
      shapes.push({
        type: 'line',
        x1: x,
        y1: rowY,
        x2: x + w,
        y2: rowY,
        style: {
          stroke: sepS?.stroke ?? nodeStroke,
          strokeWidth: sepS?.strokeWidth ?? Math.max(0.5, nodeStrokeWidth / 2),
          ...(sepS?.strokeDasharray ? { strokeDasharray: sepS.strokeDasharray } : {}),
        },
      });
    }
  }

  // Inner divider between key and value column (styled mode only).
  if (styled) {
    shapes.push({
      type: 'line',
      x1: x + node.keyW,
      y1: y,
      x2: x + node.keyW,
      y2: y + totalH,
      style: {
        stroke: sepS?.stroke ?? nodeStroke,
        strokeWidth: sepS?.strokeWidth ?? Math.max(0.5, nodeStrokeWidth / 2),
        ...(sepS?.strokeDasharray ? { strokeDasharray: sepS.strokeDasharray } : {}),
      },
    });
  }

  return shapes;
}

/** Convert a class property map (lowercased keys) into a `HighlightStyle`.
 * Supports `BackGroundColor`, `FontColor`, and `FontStyle` (italic|bold or
 * `italic bold` combined). Other props are ignored. Returns `{}` when no
 * class is set (caller still treats the row as highlighted via default fill). */
function resolveHighlightStyle(
  props: Record<string, string> | undefined,
): HighlightStyle {
  if (!props) return {};
  const out: HighlightStyle = {};
  const bg = props['backgroundcolor'];
  if (bg) out.fill = normalizeColor(bg);
  const fc = props['fontcolor'];
  if (fc) out.fontColor = normalizeColor(fc);
  const fs = props['fontstyle'];
  if (fs) {
    const lc = fs.toLowerCase();
    if (lc.includes('italic')) out.fontStyle = 'italic';
    if (lc.includes('bold')) out.fontWeight = 'bold';
  }
  return out;
}

/** Pass-through for named CSS colors (browsers render `green`, `red`, etc.
 * natively) and hex codes. We don't translate names here so the SVG renderer
 * can use them verbatim. */
function normalizeColor(raw: string): string {
  return raw;
}

function formatPrimitive(v: Primitive): { text: string; color: string } {
  if (v === null) return { text: 'null', color: COLOR_NULL };
  if (typeof v === 'string') return { text: `"${escapeDisplay(v)}"`, color: COLOR_STRING };
  if (typeof v === 'number') return { text: String(v), color: COLOR_NUMBER };
  if (typeof v === 'boolean') return { text: String(v), color: COLOR_BOOLEAN };
  return { text: String(v), color: '#000' };
}

function escapeDisplay(s: string): string {
  return s.replace(/\\/g, '\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function isComposite(v: unknown): v is unknown[] | Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function scalarOnly(ast: KvTreeInput): Scene {
  const formatted = formatPrimitive(ast.data as Primitive);
  const m = measureText(formatted.text, VALUE_FONT);
  const w = m.width + ROW_PAD_X * 2 + PAGE_PAD * 2;
  const h = m.height + ROW_PAD_Y * 2 + PAGE_PAD * 2;
  return {
    width: w,
    height: h,
    background: '#fff',
    children: [
      {
        type: 'rect',
        x: PAGE_PAD,
        y: PAGE_PAD,
        w: m.width + ROW_PAD_X * 2,
        h: m.height + ROW_PAD_Y * 2,
        style: { fill: COLOR_CELL_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
      },
      {
        type: 'text',
        x: PAGE_PAD + ROW_PAD_X,
        y: PAGE_PAD + (m.height + ROW_PAD_Y * 2) / 2,
        text: formatted.text,
        anchor: 'start',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: VALUE_FONT, color: formatted.color },
      },
    ],
  };
}

function errorScene(message: string, label: string): Scene {
  return {
    width: 480,
    height: 80,
    background: '#fff',
    children: [
      {
        type: 'rect',
        x: 0.5, y: 0.5, w: 479, h: 79,
        style: { fill: '#fff5f5', stroke: '#c33', strokeWidth: 1 },
      },
      {
        type: 'text',
        x: 12, y: 24,
        text: label,
        anchor: 'start', baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: 14, weight: 'bold', color: '#c33' },
      },
      {
        type: 'text',
        x: 12, y: 52,
        text: message.slice(0, 70),
        anchor: 'start', baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: 12, color: '#333' },
      },
    ],
  };
}
