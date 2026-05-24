import type { MindmapAst } from '../../ast/tree.js';
import { parseTree } from '../tree/index.js';

export function parseMindmap(source: string): MindmapAst {
  const { title, root } = parseTree(source);
  return { kind: 'mindmap', title, root };
}
