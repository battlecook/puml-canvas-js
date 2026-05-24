import type { ContainerAst } from '../../ast/container.js';
import { NAME, extractName, runContainerParser, type DeclResult } from './shared.js';

const OBJECT_DECL = new RegExp(
  String.raw`^object\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*(\{)?\s*$`,
  'i',
);
const ATTRIBUTE_LINE = /^(\S+)\s*:\s*(.+)$/;

export function parseObject(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'object',
    defaultNodeKind: 'object',
    tryDecl(text): DeclResult | null {
      const m = OBJECT_DECL.exec(text);
      if (!m) return null;
      const name = extractName(m[1], m[2]);
      const id = m[3] ?? name;
      return {
        node: { id, name, nodeKind: 'object', attributes: [], children: [] },
        hasOpenBrace: !!m[5],
      };
    },
    tryAttributeLine(text, byId) {
      const m = ATTRIBUTE_LINE.exec(text);
      if (!m) return false;
      const id = m[1]!;
      const node = byId.get(id);
      if (!node || node.nodeKind !== 'object') return false;
      node.attributes.push(m[2]!.trim());
      return true;
    },
  });
}
