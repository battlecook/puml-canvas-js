import type { ContainerAst, ContainerNodeKind } from '../../ast/container.js';
import { NAME, extractName, runContainerParser, type DeclResult } from './shared.js';

const DEPLOYMENT_DECL = new RegExp(
  String.raw`^(node|cloud|database|folder|frame|rectangle|component|interface|artifact|storage|queue|package)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*(\{)?\s*$`,
  'i',
);
const COMPONENT_SHORT = /^\[([^\]]+)\](?:\s+as\s+(\S+))?\s*(\{)?\s*$/;

export function parseDeployment(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'deployment',
    defaultNodeKind: 'node',
    tryDecl(text): DeclResult | null {
      let m: RegExpExecArray | null;
      if ((m = DEPLOYMENT_DECL.exec(text))) {
        const kindToken = mapKind(m[1]!.toLowerCase());
        const name = extractName(m[2], m[3]);
        const id = m[4] ?? name;
        return {
          node: { id, name, nodeKind: kindToken, attributes: [], children: [] },
          hasOpenBrace: !!m[6],
        };
      }
      if ((m = COMPONENT_SHORT.exec(text))) {
        const name = m[1]!.trim();
        const id = m[2] ?? name;
        return {
          node: { id, name, nodeKind: 'component', attributes: [], children: [] },
          hasOpenBrace: !!m[3],
        };
      }
      return null;
    },
    normalizeEndpoint(raw) {
      const t = raw.trim();
      if (t.startsWith('[') && t.endsWith(']')) {
        return { name: t.slice(1, -1).trim(), nodeKind: 'component' };
      }
      return { name: t };
    },
  });
}

function mapKind(token: string): ContainerNodeKind {
  if (token === 'package') return 'rectangle';
  return token as ContainerNodeKind;
}
