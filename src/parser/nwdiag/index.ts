import type {
  NwdiagAst,
  NwdiagLink,
  NwdiagNetwork,
  NwdiagNode,
  NwdiagTopNode,
} from '../../ast/nwdiag.js';

const WRAPPER = /^@(start|end)\w+/i;
const OUTER_OPEN = /^nwdiag\s*\{?\s*$/i;
// Named network: `network NAME {`
const NETWORK_OPEN_NAMED = /^network\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{?\s*$/i;
// Anonymous network: `network {`
const NETWORK_OPEN_ANON = /^network\s*\{\s*$/i;
// `address = "210.x.x.x/24"` or `address = 210.0.0.0` — value optional quotes.
const PROP_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/;
const CLOSE_BRACE = /^\}\s*$/;
// A bare identifier line (optionally with `[k = v, ...]` bracket attributes and
// an optional trailing semicolon) inside a network block represents a member
// node. Outside a network this same shape is a top-level node declaration.
const NODE_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[(.*)\]\s*)?;?\s*$/;
// `A -- B` undirected link, optional trailing `;`.
const LINK_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*--\s*([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$/;

/**
 * Minimal network-diagram parser. Recognises the small subset of nwdiag
 * grammar needed by the demo inputs:
 *   - an optional `nwdiag { ... }` outer wrapper
 *   - one or more `network [NAME] { ... }` blocks (name optional)
 *   - `address = "..."` properties inside a network
 *   - bare identifier lines inside a network as member nodes (optional `;`)
 *   - bare identifier lines outside any network as top-level node declarations,
 *     optionally carrying inline `[shape = X]` attributes
 *   - `A -- B` lines outside any network as undirected links
 *
 * Unknown lines are silently skipped so partial syntax never explodes the
 * pipeline — we render what we understood and drop the rest.
 */
export function parseNwdiag(source: string): NwdiagAst {
  const lines = source.split(/\r\n|\r|\n/);
  const networks: NwdiagNetwork[] = [];
  const topNodes: NwdiagTopNode[] = [];
  const links: NwdiagLink[] = [];

  // Track which container we're currently inside. `braceDepth` is the
  // open-brace stack depth relative to the outer `nwdiag { ... }`. `currentNet`
  // is non-null while we're inside a `network ... { ... }` body.
  let braceDepth = 0;
  let currentNet: NwdiagNetwork | null = null;
  let anonCounter = 0;

  for (const rawLine of lines) {
    const text = stripComment(rawLine).trim();
    if (text === '') continue;
    if (WRAPPER.test(text)) continue;

    // Standalone close brace — exit the current container.
    if (CLOSE_BRACE.test(text)) {
      if (currentNet !== null) {
        networks.push(currentNet);
        currentNet = null;
      } else if (braceDepth > 0) {
        braceDepth--;
      }
      continue;
    }

    // Outer `nwdiag {` wrapper.
    if (OUTER_OPEN.test(text) && currentNet === null) {
      braceDepth++;
      continue;
    }

    // `network NAME {` opens a named network body.
    const netNamed = NETWORK_OPEN_NAMED.exec(text);
    if (netNamed && currentNet === null) {
      currentNet = {
        id: netNamed[1]!,
        name: netNamed[1]!,
        nodes: [],
      };
      continue;
    }

    // `network {` opens an anonymous network body — assign a synthetic id.
    if (NETWORK_OPEN_ANON.test(text) && currentNet === null) {
      const autoId = `auto_${anonCounter++}`;
      currentNet = {
        id: autoId,
        name: '',
        nodes: [],
      };
      continue;
    }

    // Inside a network body: property line, or member-node line.
    if (currentNet !== null) {
      const prop = PROP_LINE.exec(text);
      if (prop) {
        const key = prop[1]!.toLowerCase();
        const value = unquote(prop[2]!);
        if (key === 'address') currentNet.address = value;
        continue;
      }
      const nodeMatch = NODE_LINE.exec(text);
      if (nodeMatch) {
        const node: NwdiagNode = { id: nodeMatch[1]! };
        const inline = nodeMatch[2];
        if (inline) {
          const addr = extractInlineAddress(inline);
          if (addr !== undefined) node.address = addr;
        }
        currentNet.nodes.push(node);
        continue;
      }
      continue;
    }

    // Outside any network: top-level link, then top-level node declaration.
    const linkMatch = LINK_LINE.exec(text);
    if (linkMatch) {
      links.push({ from: linkMatch[1]!, to: linkMatch[2]! });
      continue;
    }
    const topNodeMatch = NODE_LINE.exec(text);
    if (topNodeMatch) {
      const node: NwdiagTopNode = { id: topNodeMatch[1]! };
      const inline = topNodeMatch[2];
      if (inline) {
        const shape = extractInlineAttr(inline, 'shape');
        if (shape !== undefined) node.shape = shape;
      }
      topNodes.push(node);
      continue;
    }
    // Unknown line — silently skip.
  }

  // Be defensive: if the source ends without closing braces, commit what we
  // have so the partial network still renders.
  if (currentNet !== null) {
    networks.push(currentNet);
  }

  const ast: NwdiagAst = { kind: 'nwdiag', networks };
  if (topNodes.length > 0) ast.nodes = topNodes;
  if (links.length > 0) ast.links = links;
  return ast;
}

function stripComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inStr = !inStr;
    else if (!inStr && c === "'") return line.slice(0, i);
  }
  return line;
}

function unquote(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1);
  }
  return t;
}

/** Extract `address = "..."` from a bracket-properties chunk. */
function extractInlineAddress(inner: string): string | undefined {
  return extractInlineAttr(inner, 'address');
}

/** Extract `key = value` from a comma-separated bracket-properties chunk.
 *  Handles quoted and unquoted values. Returns the bare value or undefined. */
function extractInlineAttr(inner: string, key: string): string | undefined {
  const re = new RegExp(`${key}\\s*=\\s*("([^"]*)"|[^,\\]]+)`, 'i');
  const m = re.exec(inner);
  if (!m) return undefined;
  return m[2] !== undefined ? m[2] : m[1]!.trim();
}
