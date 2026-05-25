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

interface Row {
  key: string;
  isPrimitive: boolean;
  primitiveText: string;
  primitiveColor: string;
  childId: string;
  highlighted: boolean;
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
    parseError: ast.parseError,
    errorLabel: 'JSON parse error',
  });
}

export interface KvTreeInput {
  title: string;
  data: unknown;
  highlights: string[][];
  parseError: string;
  errorLabel: string;
}

export function layoutKvTree(ast: KvTreeInput): Scene {
  if (ast.parseError) {
    return errorScene(ast.parseError, ast.errorLabel);
  }

  const highlightSet = new Set(ast.highlights.map((p) => p.join('')));
  const graph = buildGraph(ast.data, highlightSet);

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
      style: { stroke: COLOR_EDGE, strokeWidth: 1, strokeDasharray: '4,3' },
    });
  }

  // Draw nodes
  for (const node of graph.nodes) {
    const pos = positions.get(node.id)!;
    shapes.push(...drawNode(node, pos.x, pos.y));
  }

  return {
    width: Math.max(totalW, 240),
    height: Math.max(totalH, 60),
    background: '#fff',
    children: shapes,
  };
}

function buildGraph(data: unknown, highlights: Set<string>): Graph {
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
      const pathKey = childPath.join('');
      const highlighted = highlights.has(pathKey);
      if (isComposite(v)) {
        return {
          key,
          isPrimitive: false,
          primitiveText: '',
          primitiveColor: '',
          childId: '',
          highlighted,
        };
      }
      const formatted = formatPrimitive(v as Primitive);
      return {
        key,
        isPrimitive: true,
        primitiveText: formatted.text,
        primitiveColor: formatted.color,
        childId: '',
        highlighted,
      };
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

function drawNode(node: NodeBox, x: number, y: number): Shape[] {
  const shapes: Shape[] = [];
  const w = node.keyW + node.valW;
  for (let i = 0; i < node.rows.length; i++) {
    const row = node.rows[i]!;
    const rowY = y + i * node.rowH;
    const valueFill = row.highlighted ? COLOR_HIGHLIGHT : COLOR_CELL_FILL;
    // Key cell
    shapes.push({
      type: 'rect',
      x,
      y: rowY,
      w: node.keyW,
      h: node.rowH,
      style: { fill: COLOR_KEY_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    shapes.push({
      type: 'text',
      x: x + ROW_PAD_X,
      y: rowY + node.rowH / 2,
      text: row.key,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: KEY_FONT, weight: 'bold', color: '#000' },
    });
    // Value cell
    shapes.push({
      type: 'rect',
      x: x + node.keyW,
      y: rowY,
      w: node.valW,
      h: node.rowH,
      style: { fill: valueFill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    if (row.isPrimitive) {
      shapes.push({
        type: 'text',
        x: x + node.keyW + ROW_PAD_X,
        y: rowY + node.rowH / 2,
        text: row.primitiveText,
        anchor: 'start',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: VALUE_FONT, color: row.primitiveColor },
      });
    } else {
      // Connector dot at right edge of value cell
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
  }
  return shapes;
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
