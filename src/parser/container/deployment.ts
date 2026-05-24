import type { ContainerAst, ContainerNodeKind } from '../../ast/container.js';
import { NAME, extractName, runContainerParser, type DeclResult } from './shared.js';

const DEPLOYMENT_DECL = new RegExp(
  String.raw`^(node|cloud|database|folder|frame|rectangle|component|interface|artifact|storage|queue|package)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*(\{)?\s*$`,
  'i',
);

export function parseDeployment(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'deployment',
    defaultNodeKind: 'node',
    tryDecl(text): DeclResult | null {
      const m = DEPLOYMENT_DECL.exec(text);
      if (!m) return null;
      const kindToken = mapKind(m[1]!.toLowerCase());
      const name = extractName(m[2], m[3]);
      const id = m[4] ?? name;
      return {
        node: { id, name, nodeKind: kindToken, attributes: [], children: [] },
        hasOpenBrace: !!m[6],
      };
    },
  });
}

function mapKind(token: string): ContainerNodeKind {
  if (token === 'package') return 'rectangle';
  return token as ContainerNodeKind;
}
