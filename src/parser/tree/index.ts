import type { TreeNode } from '../../ast/tree.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;
// Bullet prefix accepts any run of a single marker character (`*`, `+`, `-`, or
// `#`). The `#` form is the Markdown-header style for mindmap/wbs nodes — its
// run length (`#` = root, `##` = level 1, …) maps to depth the same way as the
// star form. Mixing markers in a single prefix (e.g. `*+`) is not valid.
//
// Optional suffixes captured after the marker run:
//   `_`         — WBS "boxless" rendering (`+_ Task`, `-_ Task`).
//   `[#Color]`  — inline node color (e.g. `*[#Orange] Colors` for mindmap).
// Either may appear, the order is `_` then `[#Color]`.
const LEVEL_LINE = /^(\*+|\++|-+|#+)(_)?(?:\[#(\S+?)\])?\s+(.+)$/;

export interface TreeParseResult {
  title: string;
  root: TreeNode | null;
}

interface RawItem {
  depth: number;
  text: string;
  marker: string;
  boxless: boolean;
  color?: string;
}

export function parseTree(source: string): TreeParseResult {
  let title = '';
  const items: RawItem[] = [];

  for (const raw of source.split(/\r\n|\r|\n/)) {
    const t = raw.trim();
    if (!t) continue;
    if (LINE_COMMENT.test(t)) continue;
    if (WRAPPER.test(t)) continue;

    const tm = TITLE.exec(t);
    if (tm) {
      title = tm[1]!.trim();
      continue;
    }

    const m = LEVEL_LINE.exec(t);
    if (!m) continue;
    const markerRun = m[1]!;
    const color = normalizeColor(m[3]);
    const item: RawItem = {
      depth: markerRun.length,
      text: m[4]!.trim(),
      marker: markerRun[0]!,
      boxless: m[2] === '_',
    };
    if (color !== undefined) item.color = color;
    items.push(item);
  }

  if (items.length === 0) return { title, root: null };

  const first = items[0]!;
  const root: TreeNode = { text: first.text, children: [] };
  if (first.boxless) root.boxless = true;
  if (first.color) root.color = first.color;
  // Root has no parent, so `side` is not meaningful — leave undefined.

  const stack: Array<{ node: TreeNode; depth: number }> = [
    { node: root, depth: first.depth },
  ];

  for (let i = 1; i < items.length; i++) {
    const item = items[i]!;
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= item.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!.node;
    const node: TreeNode = { text: item.text, children: [] };
    if (item.marker === '-') node.side = 'left';
    else if (item.marker === '+') node.side = 'right';
    if (item.boxless) node.boxless = true;
    if (item.color) node.color = item.color;
    parent.children.push(node);
    stack.push({ node, depth: item.depth });
  }

  return { title, root };
}

/**
 * The bullet `[#Color]` form drops the literal `#` during capture (already
 * consumed by the regex). Re-attach it when the value is a hex literal so SVG
 * `fill=` resolves correctly; CSS color names (e.g. `Orange`, `lightblue`) are
 * passed through unchanged.
 */
function normalizeColor(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return /^[0-9a-fA-F]{3,8}$/.test(raw) ? `#${raw}` : raw;
}
