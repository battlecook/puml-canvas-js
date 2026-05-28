import type { ContainerAst, ContainerNode } from '../../ast/container.js';
import {
  NAME,
  SHAPE_KIND_KEYWORDS,
  applyContainerStyleSuffix,
  extractName,
  mapShapeKind,
  parseLabelBlocks,
  runContainerParser,
  type DeclResult,
} from './shared.js';

// `#X` or `#X;line:..` — captured as a single non-space-non-`{` token so the
// multi-property inline-style format `#pink;line:red;line.bold;text:red` is
// preserved end-to-end and parsed by `applyContainerStyleSuffix`. Two forms
// exist: TRAILING (`<decl> #style`, with a required leading space) and INNER
// (`<kind> <id> #style [bracket]`, where the id already consumed its trailing
// space). The inner form uses `\s*` to allow either zero or one space.
const STYLE_TAIL = String.raw`(?:\s+(#[^\s{]+))?`;
const STYLE_INNER = String.raw`(?:(#[^\s{]+)\s+)?`;
const DEPLOYMENT_DECL = new RegExp(
  String.raw`^(${SHAPE_KIND_KEYWORDS})\s+` +
    NAME +
    String.raw`(?:\s+as\s+(?:"([^"]+)"|(\S+)))?(?:\s+<<\s*([^>]+?)\s*>>)?` +
    STYLE_TAIL +
    String.raw`\s*(\{)?\s*$`,
  'i',
);
// `<keyword> [Display Name]` or `<keyword> Id [multi-line label]` (the bracket
// content can carry newlines after `joinBracketContinuations`). Style tail
// may appear before OR after the bracket; both positions captured separately.
const DEPLOYMENT_BRACKET_DECL = new RegExp(
  String.raw`^(${SHAPE_KIND_KEYWORDS})\s+(?:(\S+)\s+)?` +
    STYLE_INNER +
    String.raw`\[([\s\S]+?)\](?:\s+as\s+(?:"([^"]+)"|(\S+)))?` +
    STYLE_TAIL +
    String.raw`\s*$`,
  'i',
);
const COMPONENT_SHORT = new RegExp(
  String.raw`^\[([^\]]+)\](?:\s+as\s+(?:"([^"]+)"|(\S+)))?` + STYLE_TAIL + String.raw`\s*(\{)?\s*$`,
);

export function parseDeployment(source: string): ContainerAst {
  return runContainerParser(source, {
    diagramKind: 'deployment',
    defaultNodeKind: 'node',
    tryDecl(text): DeclResult | null {
      let m: RegExpExecArray | null;
      if ((m = DEPLOYMENT_BRACKET_DECL.exec(text))) {
        const kindToken = mapShapeKind(m[1]!.toLowerCase());
        const leadingStyle = m[3];
        const labelRaw = m[4]!.trim();
        const blocks = parseLabelBlocks(labelRaw);
        const aliasDisplay = m[5]; // quoted alias display name (`as "Display"`)
        const explicitId = aliasDisplay !== undefined ? m[6] : (m[2] ?? m[6]);
        const id = explicitId ?? labelRaw;
        const name = aliasDisplay !== undefined ? aliasDisplay : labelRaw;
        const node: ContainerNode = {
          id,
          name,
          nodeKind: kindToken,
          attributes: [],
          children: [],
        };
        if (blocks) node.labelBlocks = blocks;
        const styleTail = leadingStyle ?? m[7];
        if (styleTail) applyContainerStyleSuffix(node, styleTail);
        return { node, hasOpenBrace: false };
      }
      if ((m = DEPLOYMENT_DECL.exec(text))) {
        const kindToken = mapShapeKind(m[1]!.toLowerCase());
        const bareName = extractName(m[2], m[3]);
        // `as "Display"` form: id = previous token, display name = the quoted
        // tail. `as Alias` form: id = the bare alias, display = original name.
        const aliasDisplay = m[4];
        const aliasBare = m[5];
        const id = aliasBare ?? bareName;
        const name = aliasDisplay !== undefined ? aliasDisplay : bareName;
        const node: ContainerNode = {
          id,
          name,
          nodeKind: kindToken,
          attributes: [],
          children: [],
        };
        if (m[7]) applyContainerStyleSuffix(node, m[7]!);
        return { node, hasOpenBrace: !!m[8] };
      }
      if ((m = COMPONENT_SHORT.exec(text))) {
        const name = m[1]!.trim();
        const aliasDisplay = m[2];
        const aliasBare = m[3];
        const id = aliasBare ?? name;
        const displayName = aliasDisplay !== undefined ? aliasDisplay : name;
        const node: ContainerNode = {
          id,
          name: displayName,
          nodeKind: 'component',
          attributes: [],
          children: [],
        };
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
