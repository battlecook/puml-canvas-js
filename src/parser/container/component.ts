import type { ContainerAst, ContainerNode } from '../../ast/container.js';
import {
  NAME,
  SHAPE_KIND_KEYWORDS,
  applyContainerStyleSuffix,
  extractName,
  mapShapeKind,
  parseLabelBlocks,
  runContainerParser,
  unescapeLabel,
  type DeclResult,
} from './shared.js';

// Multi-property style suffix (`#pink`, `#pink;line:red;line.bold;text:red`).
// We capture the whole `#…` token so `applyContainerStyleSuffix` can split the
// segments. Stops at whitespace or `{` so it doesn't swallow a brace body.
//
// Two positional forms:
//   TRAILING (`<decl> #style`)   — requires a leading `\s+`.
//   INNER    (`<kind> <id> #style [bracket]`) — id already consumed its
//   trailing space, so we use a `\s+` AFTER the captured token (zero-or-one
//   match before is implicit because the surrounding `(?:(\S+)\s+)?` group
//   already includes one trailing space).
const STYLE_TAIL = String.raw`(?:\s+(#[^\s{]+))?`;
const STYLE_INNER = String.raw`(?:(#[^\s{]+)\s+)?`;
// `interface` is component-diagram-only and kept on the component parser's
// kind list (deployment shares the rest via SHAPE_KIND_KEYWORDS).
const COMPONENT_KINDS = `interface|${SHAPE_KIND_KEYWORDS}`;
const MIXED_DECL = new RegExp(
  String.raw`^(${COMPONENT_KINDS})\s+` +
    NAME +
    String.raw`(?:\s+as\s+(?:"([^"]+)"|(\S+)))?(?:\s+<<\s*([^>]+?)\s*>>)?` +
    STYLE_TAIL +
    String.raw`\s*(\{)?\s*$`,
  'i',
);
// `<keyword> [Display Name] (as Alias)? (#Color)?` — bracket-wrapped display
// name attached directly to the keyword. The captured group `(.+?)` can span
// multiple lines after `joinBracketContinuations` pre-joins continuations.
// A `#style` token may appear between the id and the `[` (PlantUML accepts
// both `cloud c #pink [...]` and `cloud c [...] #pink`); only one is
// captured per call so style group 6 is set in the second case and the
// optional leading-style is folded into the same capture via the second
// `STYLE_TAIL`.
const MIXED_BRACKET_DECL = new RegExp(
  String.raw`^(${COMPONENT_KINDS})\s+(?:(\S+)\s+)?` +
    STYLE_INNER +
    String.raw`\[([\s\S]+?)\](?:\s+as\s+(?:"([^"]+)"|(\S+)))?` +
    STYLE_TAIL +
    String.raw`\s*$`,
  'i',
);
const COMPONENT_SHORT = new RegExp(
  String.raw`^\[([^\]]+)\](?:\s+as\s+(?:"([^"]+)"|(\S+)))?` + STYLE_TAIL + String.raw`\s*(\{)?\s*$`,
);
// Component-diagram interface shorthand:
//   `() "Display Name"`              — anonymous; id == display
//   `() "Display Name" as Alias`     — explicit alias id
// Empty parens are the discriminator vs the usecase `(Name)` form (content
// between the parens) — see `detect.ts`.
const INTERFACE_SHORT = /^\(\)\s*"([^"]+)"(?:\s+as\s+(\S+))?\s*$/;

export function parseComponent(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'component',
    defaultNodeKind: 'component',
    tryDecl(text): DeclResult | null {
      let m: RegExpExecArray | null;
      if ((m = INTERFACE_SHORT.exec(text))) {
        const name = unescapeLabel(m[1]!.trim());
        const id = m[2] ?? name;
        return {
          node: { id, name, nodeKind: 'interface', attributes: [], children: [] },
          hasOpenBrace: false,
        };
      }
      // Keyword + bracket form, possibly multi-line. Checked before the
      // generic MIXED_DECL because the bracket is not part of NAME's charset.
      if ((m = MIXED_BRACKET_DECL.exec(text))) {
        const kindToken = mapShapeKind(m[1]!.toLowerCase());
        const leadingStyle = m[3];
        const labelRaw = m[4]!.trim();
        const blocks = parseLabelBlocks(labelRaw);
        const aliasDisplay = m[5];
        const explicitId = aliasDisplay !== undefined ? m[6] : (m[2] ?? m[6]);
        const id = explicitId ?? labelRaw;
        const name = aliasDisplay !== undefined ? aliasDisplay : labelRaw;
        const node: ContainerNode = { id, name, nodeKind: kindToken, attributes: [], children: [] };
        if (blocks) node.labelBlocks = blocks;
        // PlantUML allows the style suffix on either side of the bracket; pick
        // whichever one matched (only one captures per source line).
        const styleTail = leadingStyle ?? m[7];
        if (styleTail) applyContainerStyleSuffix(node, styleTail);
        return { node, hasOpenBrace: false };
      }
      if ((m = MIXED_DECL.exec(text))) {
        const kindToken = mapShapeKind(m[1]!.toLowerCase());
        // Quoted display labels may carry `\n` escapes; expand them so the
        // stored name contains real newlines (layout splits on `\n`).
        const rawName = extractName(m[2], m[3]);
        const bareName = m[2] !== undefined ? unescapeLabel(rawName) : rawName;
        const aliasDisplay = m[4];
        const aliasBare = m[5];
        const id = aliasBare ?? bareName;
        const name = aliasDisplay !== undefined ? aliasDisplay : bareName;
        const node: ContainerNode = { id, name, nodeKind: kindToken, attributes: [], children: [] };
        if (m[7]) applyContainerStyleSuffix(node, m[7]!);
        return { node, hasOpenBrace: !!m[8] };
      }
      if ((m = COMPONENT_SHORT.exec(text))) {
        const name = m[1]!.trim();
        const aliasDisplay = m[2];
        const aliasBare = m[3];
        const id = aliasBare ?? name;
        const displayName = aliasDisplay !== undefined ? aliasDisplay : name;
        const node: ContainerNode = { id, name: displayName, nodeKind: 'component', attributes: [], children: [] };
        if (m[4]) applyContainerStyleSuffix(node, m[4]!);
        return { node, hasOpenBrace: !!m[5] };
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
