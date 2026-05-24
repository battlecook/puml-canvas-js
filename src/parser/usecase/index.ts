import type {
  UCNode,
  UCNodeKind,
  UCRelationship,
  UseCaseAst,
} from '../../ast/usecase.js';
import { parseRelationship } from '../class/relationships.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const NAME = String.raw`(?:"([^"]+)"|([^\s,"<>{}]+))`;

const ACTOR_DECL = new RegExp(
  String.raw`^actor\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*$`,
  'i',
);
const USECASE_DECL = new RegExp(
  String.raw`^usecase\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*$`,
  'i',
);
const ACTOR_SHORT = /^:([^:]+):(?:\s+as\s+(\S+))?\s*$/;
const USECASE_SHORT = /^\(([^)]+)\)(?:\s+as\s+(\S+))?\s*$/;

export function parseUseCase(source: string): UseCaseAst {
  const ast: UseCaseAst = { kind: 'usecase', title: '', nodes: [], relationships: [] };
  const byId = new Map<string, UCNode>();
  const lines = source.split(/\r\n|\r|\n/);

  const upsert = (n: UCNode): UCNode => {
    const existing = byId.get(n.id);
    if (existing) return existing;
    byId.set(n.id, n);
    ast.nodes.push(n);
    return n;
  };

  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    const tm = TITLE.exec(text);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = ACTOR_DECL.exec(text))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      const id = m[3] ?? name;
      upsert({ id, name, kind: 'actor' });
      continue;
    }
    if ((m = USECASE_DECL.exec(text))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      const id = m[3] ?? name;
      upsert({ id, name, kind: 'usecase' });
      continue;
    }
    if ((m = ACTOR_SHORT.exec(text))) {
      const name = m[1]!.trim();
      const id = m[2] ?? name;
      upsert({ id, name, kind: 'actor' });
      continue;
    }
    if ((m = USECASE_SHORT.exec(text))) {
      const name = m[1]!.trim();
      const id = m[2] ?? name;
      upsert({ id, name, kind: 'usecase' });
      continue;
    }

    const rel = parseRelationship(text);
    if (rel) {
      const left = normalizeEndpoint(rel.source);
      const right = normalizeEndpoint(rel.target);
      if (left.kind) upsert({ id: left.name, name: left.name, kind: left.kind });
      if (right.kind) upsert({ id: right.name, name: right.name, kind: right.kind });
      if (!byId.has(left.name)) upsert({ id: left.name, name: left.name, kind: 'usecase' });
      if (!byId.has(right.name)) upsert({ id: right.name, name: right.name, kind: 'usecase' });

      const ucRel: UCRelationship = {
        source: left.name,
        target: right.name,
        arrowToken: rel.arrowToken,
        style: rel.style,
        sourceMarker: rel.sourceMarker,
        targetMarker: rel.targetMarker,
        label: rel.label,
      };
      ast.relationships.push(ucRel);
    }
  }

  return ast;
}

function normalizeEndpoint(raw: string): { name: string; kind?: UCNodeKind } {
  const t = raw.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    return { name: t.slice(1, -1).trim(), kind: 'usecase' };
  }
  if (t.startsWith(':') && t.endsWith(':')) {
    return { name: t.slice(1, -1).trim(), kind: 'actor' };
  }
  return { name: t };
}
