import type { ContainerAst, ContainerNode, MapEntry } from '../../ast/container.js';
import { NAME, extractName, runContainerParser, type DeclResult } from './shared.js';

const OBJECT_DECL = new RegExp(
  String.raw`^object\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*(\{)?\s*$`,
  'i',
);
const ATTRIBUTE_LINE = /^(\S+)\s*:\s*(.+)$/;

// Multi-line `map Name { … }` block. Quoted-display form supports markup
// (`"Map **Country => CapitalCity**" as CC`). Bare form keeps the id as the
// display name. Display text is stored raw so layout can run it through the
// Creole markup parser.
const MAP_DECL = new RegExp(
  String.raw`^map\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?\s*\{\s*$`,
  'i',
);
const MAP_ENTRY = /^(.+?)\s*=>\s*(.+?)\s*$/;
const MAP_CLOSE = /^\}\s*$/;

export function parseObject(source: string): ContainerAst {
  // First pass: extract every `map … { … }` block. We replace the block with
  // a synthetic single-line `object` declaration so the shared parser still
  // sees the id (preserves ordering and relationship endpoints) but does NOT
  // try to interpret the `key => value` rows as attributes or arrows.
  const mapNodes = new Map<string, { name: string; entries: MapEntry[] }>();
  const stripped = stripMapBlocks(source, mapNodes);

  const ast = runContainerParser(stripped, {
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

  // Second pass: promote any node whose id matches a captured map block from
  // `object` to `map` and attach its entries. The shared parser already placed
  // them in the right slot (root or nested) and merged duplicate ids.
  if (mapNodes.size > 0) {
    promoteMaps(ast.nodes, mapNodes);
  }

  return ast;
}

/**
 * Walks the source line-by-line and replaces each `map id { … }` block with a
 * single synthetic `object id` declaration. The block's entries are recorded
 * in `out` keyed by id so `parseObject` can attach them after the standard
 * parse. Quoted display names and `as alias` forms are both supported.
 */
function stripMapBlocks(
  source: string,
  out: Map<string, { name: string; entries: MapEntry[] }>,
): string {
  const lines = source.split(/\r\n|\r|\n/);
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    const m = MAP_DECL.exec(trimmed);
    if (!m) {
      result.push(raw);
      i++;
      continue;
    }
    const displayName = extractName(m[1], m[2]);
    const id = m[3] ?? displayName;
    const entries: MapEntry[] = [];
    i++;
    while (i < lines.length) {
      const inner = lines[i]!.trim();
      i++;
      if (!inner) continue;
      if (MAP_CLOSE.test(inner)) break;
      const em = MAP_ENTRY.exec(inner);
      if (em) entries.push({ key: em[1]!.trim(), value: em[2]!.trim() });
    }
    out.set(id, { name: displayName, entries });
    // Emit a synthetic single-line `object` declaration so the shared parser
    // registers the id (and respects any relationships that reference it).
    // We quote the display name to preserve spaces/markup.
    result.push(`object "${displayName}" as ${id}`);
  }
  return result.join('\n');
}

function promoteMaps(
  nodes: ContainerNode[],
  mapNodes: Map<string, { name: string; entries: MapEntry[] }>,
): void {
  for (const n of nodes) {
    const m = mapNodes.get(n.id);
    if (m) {
      n.nodeKind = 'map';
      n.name = m.name;
      n.mapEntries = m.entries;
    }
    if (n.children.length > 0) promoteMaps(n.children, mapNodes);
  }
}
