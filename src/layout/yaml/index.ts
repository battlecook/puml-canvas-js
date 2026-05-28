import type { YamlAst } from '../../ast/yaml.js';
import type { Scene } from '../../scene/types.js';
import {
  layoutKvTree,
  type KvEdgeStyle,
  type KvNodeStyle,
  type KvSeparatorStyle,
  type KvStyling,
} from '../json/index.js';

const STYLE_PREFIX = 'yamldiagram.';

export function layoutYaml(ast: YamlAst): Scene {
  const styling = ast.styles ? buildStyling(ast.styles) : undefined;
  return layoutKvTree({
    title: ast.title,
    data: ast.data,
    highlights: ast.highlights,
    parseError: ast.parseError,
    errorLabel: 'YAML parse error',
    ...(styling ? { styling } : {}),
  });
}

function buildStyling(styles: Record<string, string>): KvStyling | undefined {
  const node: KvNodeStyle = {};
  const arrow: KvEdgeStyle = {};
  const separator: KvSeparatorStyle = {};

  for (const [rawKey, value] of Object.entries(styles)) {
    if (!rawKey.startsWith(STYLE_PREFIX)) continue;
    const rest = rawKey.slice(STYLE_PREFIX.length);
    const parts = rest.split('.');
    if (parts.length < 2) continue;
    const scope = parts[0]!;
    const prop = parts[parts.length - 1]!;
    const isSeparator = parts.length >= 3 && parts[1] === 'separator';

    if (scope === 'node' && isSeparator) {
      applyToSeparator(separator, prop, value);
    } else if (scope === 'node') {
      applyToNode(node, prop, value);
    } else if (scope === 'arrow') {
      applyToArrow(arrow, prop, value);
    }
  }

  const out: KvStyling = {};
  if (Object.keys(node).length > 0) out.node = node;
  if (Object.keys(arrow).length > 0) out.arrow = arrow;
  if (Object.keys(separator).length > 0) out.separator = separator;
  return Object.keys(out).length > 0 ? out : undefined;
}

function applyToNode(target: KvNodeStyle, prop: string, value: string): void {
  switch (prop) {
    case 'backgroundcolor':
      target.fill = value;
      break;
    case 'linecolor':
      target.stroke = value;
      break;
    case 'linethickness': {
      const n = Number(value);
      if (!Number.isNaN(n)) target.strokeWidth = n;
      break;
    }
    case 'linestyle':
      target.strokeDasharray = parseDash(value);
      break;
    case 'roundcorner': {
      const n = Number(value);
      if (!Number.isNaN(n)) {
        target.rx = n;
        target.ry = n;
      }
      break;
    }
    case 'fontname':
      target.fontFamily = value;
      break;
    case 'fontsize': {
      const n = Number(value);
      if (!Number.isNaN(n)) target.fontSize = n;
      break;
    }
    case 'fontcolor':
      target.fontColor = value;
      break;
    case 'fontstyle':
      if (/bold/i.test(value)) target.fontWeight = 'bold';
      else if (/normal|plain/i.test(value)) target.fontWeight = 'normal';
      break;
    default:
      break;
  }
}

function applyToArrow(target: KvEdgeStyle, prop: string, value: string): void {
  switch (prop) {
    case 'linecolor':
      target.stroke = value;
      break;
    case 'linethickness': {
      const n = Number(value);
      if (!Number.isNaN(n)) target.strokeWidth = n;
      break;
    }
    case 'linestyle':
      target.strokeDasharray = parseDash(value);
      break;
    default:
      break;
  }
}

function applyToSeparator(target: KvSeparatorStyle, prop: string, value: string): void {
  switch (prop) {
    case 'linecolor':
      target.stroke = value;
      break;
    case 'linethickness': {
      const n = Number(value);
      if (!Number.isNaN(n)) target.strokeWidth = n;
      break;
    }
    case 'linestyle':
      target.strokeDasharray = parseDash(value);
      break;
    default:
      break;
  }
}

/** Convert PlantUML's `N-M` dash spec into SVG strokeDasharray `N,M`. */
function parseDash(raw: string): string {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (m) return `${m[1]},${m[2]}`;
  return raw;
}
