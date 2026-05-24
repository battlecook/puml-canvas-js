import type { WbsAst } from '../../ast/tree.js';
import { parseTree } from '../tree/index.js';

export function parseWbs(source: string): WbsAst {
  const { title, root } = parseTree(source);
  return { kind: 'wbs', title, root };
}
