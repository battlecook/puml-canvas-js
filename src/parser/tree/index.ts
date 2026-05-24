import type { TreeNode } from '../../ast/tree.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;
const LEVEL_LINE = /^([*+\-]+)\s+(.+)$/;

export interface TreeParseResult {
  title: string;
  root: TreeNode | null;
}

export function parseTree(source: string): TreeParseResult {
  let title = '';
  const items: Array<{ depth: number; text: string }> = [];

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
    items.push({ depth: m[1]!.length, text: m[2]!.trim() });
  }

  if (items.length === 0) return { title, root: null };

  const root: TreeNode = { text: items[0]!.text, children: [] };
  const stack: Array<{ node: TreeNode; depth: number }> = [
    { node: root, depth: items[0]!.depth },
  ];

  for (let i = 1; i < items.length; i++) {
    const { depth, text } = items[i]!;
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!.node;
    const node: TreeNode = { text, children: [] };
    parent.children.push(node);
    stack.push({ node, depth });
  }

  return { title, root };
}
