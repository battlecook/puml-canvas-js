import type { ContainerAst, ContainerNode } from '../../ast/container.js';
import {
  NAME,
  SHAPE_KIND_KEYWORDS,
  applyContainerStyleSuffix,
  extractName,
  mapShapeKind,
  parseLabelBlocks,
  resolveArchimateLayer,
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
//
// An optional trailing `$tag` token is tolerated as a no-op decorator so
// `component [$C2] $C2` parses cleanly (mirrors the class-diagram parser's
// LEADING_TAG handling — here the tag sits after the declaration).
const TRAILING_TAG = String.raw`(?:\s+\$\S+)?`;
const MIXED_BRACKET_DECL = new RegExp(
  String.raw`^(${COMPONENT_KINDS})\s+(?:(\S+)\s+)?` +
    STYLE_INNER +
    String.raw`\[([\s\S]+?)\](?:\s+as\s+(?:"([^"]+)"|(\S+)))?` +
    STYLE_TAIL +
    TRAILING_TAG +
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
// Archimate element declaration:
//   `archimate #Layer "Display" as id <<stereotype>>`
// The layer hint is optional; when present it picks a conventional pastel fill
// (`#Technology` → green). Display name accepts the quoted or bare form. The
// stereotype tail captures the Archimate element type (`technology-device`,
// `business-process`, …); layout renders it above the name.
const ARCHIMATE_DECL = new RegExp(
  String.raw`^archimate(?:\s+(#\S+))?\s+(?:"([^"]+)"|(\S+))\s+as\s+(\S+)` +
    String.raw`(?:\s+<<\s*([^>]+?)\s*>>)?\s*$`,
  'i',
);

export function parseComponent(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'component',
    defaultNodeKind: 'component',
    // Component diagrams promote bare undeclared endpoints to interfaces
    // (PlantUML's `[Component] --> HTTP` shorthand). Deployment / object
    // parsers leave the flag off so the same input keeps its default kind.
    autoInterfaceFromBare: true,
    tryDecl(text): DeclResult | null {
      let m: RegExpExecArray | null;
      // Archimate node form is checked first because its leading keyword
      // (`archimate`) is otherwise unrecognised and would silently drop.
      if ((m = ARCHIMATE_DECL.exec(text))) {
        const layerHint = m[1];
        const quoted = m[2];
        const bare = m[3];
        const alias = m[4]!;
        const stereotype = m[5];
        const rawName = extractName(quoted, bare);
        const name = quoted !== undefined ? unescapeLabel(rawName) : rawName;
        const node: ContainerNode = {
          id: alias,
          name,
          nodeKind: 'rectangle',
          attributes: [],
          children: [],
        };
        if (layerHint) {
          const layerFill = resolveArchimateLayer(layerHint);
          if (layerFill !== null) {
            node.fill = layerFill;
          } else {
            // Unknown layer token — treat as a literal `#Color` so users can
            // still pass a CSS color name or hex (`archimate #Pink "Foo" as F`).
            applyContainerStyleSuffix(node, layerHint);
          }
        }
        if (stereotype) node.stereotype = stereotype;
        return { node, hasOpenBrace: false };
      }
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
        // Expand `\n` escapes inside the bracket label so the stored name (and
        // any derived label blocks) contains real newlines — layout splits on
        // `\n` to render multi-line labels.
        const labelRaw = unescapeLabel(m[4]!.trim());
        const blocks = parseLabelBlocks(labelRaw);
        const aliasDisplay = m[5];
        const explicitId = aliasDisplay !== undefined ? m[6] : (m[2] ?? m[6]);
        const id = explicitId ?? labelRaw;
        const name = aliasDisplay !== undefined ? unescapeLabel(aliasDisplay) : labelRaw;
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
        const stereotype = m[6];
        const node: ContainerNode = { id, name, nodeKind: kindToken, attributes: [], children: [] };
        if (stereotype) node.stereotype = stereotype;
        if (m[7]) applyContainerStyleSuffix(node, m[7]!);
        return { node, hasOpenBrace: !!m[8] };
      }
      if ((m = COMPONENT_SHORT.exec(text))) {
        // Bracket display labels (`[First\ncomponent]`) honor `\n` escapes the
        // same way quoted labels do — expand them so layout renders one row
        // per segment.
        const name = unescapeLabel(m[1]!.trim());
        const aliasDisplay = m[2];
        const aliasBare = m[3];
        const id = aliasBare ?? name;
        const displayName = aliasDisplay !== undefined ? unescapeLabel(aliasDisplay) : name;
        const blocks = parseLabelBlocks(displayName);
        const node: ContainerNode = { id, name: displayName, nodeKind: 'component', attributes: [], children: [] };
        if (blocks) node.labelBlocks = blocks;
        if (m[4]) applyContainerStyleSuffix(node, m[4]!);
        return { node, hasOpenBrace: !!m[5] };
      }
      return null;
    },
    normalizeEndpoint(raw) {
      const t = raw.trim();
      if (t.startsWith('[') && t.endsWith(']')) {
        // `[Name]` is an explicit shorthand declaration even when it appears
        // at an arrow endpoint, so it joins the active container (Bug C)
        // and is excluded from the auto-interface post-pass (Bug B2).
        return { name: t.slice(1, -1).trim(), nodeKind: 'component', explicit: true };
      }
      return { name: t };
    },
  });
}
