import type {
  ContainerAst,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
} from '../../ast/container.js';
import { parseRelationship } from '../class/relationships.js';

export const WRAPPER = /^@(start|end)\w+/i;
export const LINE_COMMENT = /^\s*'/;
export const TITLE = /^title\s+(.+)\s*$/i;
export const NAME = String.raw`(?:"([^"]+)"|([^\s,"<>{}]+))`;
export const BLOCK_CLOSE = /^\}\s*$/;

export interface DeclResult {
  node: ContainerNode;
  hasOpenBrace: boolean;
}

export interface ContainerParserOptions {
  diagramKind: ContainerAst['kind'];
  defaultNodeKind: ContainerNodeKind;
  tryDecl: (text: string) => DeclResult | null;
  normalizeEndpoint?: (raw: string) => { name: string; nodeKind?: ContainerNodeKind };
  tryAttributeLine?: (text: string, byId: Map<string, ContainerNode>) => boolean;
}

export function runContainerParser(source: string, opts: ContainerParserOptions): ContainerAst {
  const ast: ContainerAst = {
    kind: opts.diagramKind,
    title: '',
    nodes: [],
    relationships: [],
  };
  const byId = new Map<string, ContainerNode>();
  const parentStack: ContainerNode[] = [];
  const lines = source.split(/\r\n|\r|\n/);

  const addNode = (node: ContainerNode): ContainerNode => {
    const existing = byId.get(node.id);
    if (existing) {
      if (existing.nodeKind === opts.defaultNodeKind && node.nodeKind !== opts.defaultNodeKind) {
        existing.nodeKind = node.nodeKind;
      }
      if (!existing.name && node.name) existing.name = node.name;
      return existing;
    }
    byId.set(node.id, node);
    const parent = parentStack[parentStack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      ast.nodes.push(node);
    }
    return node;
  };

  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    if (BLOCK_CLOSE.test(text)) {
      parentStack.pop();
      continue;
    }

    const tm = TITLE.exec(text);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }

    const decl = opts.tryDecl(text);
    if (decl) {
      const stored = addNode(decl.node);
      if (decl.hasOpenBrace) parentStack.push(stored);
      continue;
    }

    if (opts.tryAttributeLine?.(text, byId)) continue;

    const rel = parseRelationship(text);
    if (rel) {
      const left = (opts.normalizeEndpoint?.(rel.source)) ?? { name: rel.source };
      const right = (opts.normalizeEndpoint?.(rel.target)) ?? { name: rel.target };

      const makeNode = (name: string, nodeKind?: ContainerNodeKind): ContainerNode => ({
        id: name,
        name,
        nodeKind: nodeKind ?? opts.defaultNodeKind,
        attributes: [],
        children: [],
      });

      if (!byId.has(left.name)) {
        addNodeAtRoot(ast, byId, makeNode(left.name, left.nodeKind));
      }
      if (!byId.has(right.name)) {
        addNodeAtRoot(ast, byId, makeNode(right.name, right.nodeKind));
      }
      const cRel: ContainerRelationship = {
        source: left.name,
        target: right.name,
        arrowToken: rel.arrowToken,
        style: rel.style,
        sourceMarker: rel.sourceMarker,
        targetMarker: rel.targetMarker,
        label: rel.label,
      };
      ast.relationships.push(cRel);
    }
  }

  return ast;
}

function addNodeAtRoot(
  ast: ContainerAst,
  byId: Map<string, ContainerNode>,
  node: ContainerNode,
): void {
  if (byId.has(node.id)) return;
  byId.set(node.id, node);
  ast.nodes.push(node);
}

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
