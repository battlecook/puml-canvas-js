import type { DiagramAst, PlaceholderAst, UnknownAst } from '../ast/index.js';
import type { Scene, Shape } from '../scene/types.js';
import { layoutSequence } from './sequence/index.js';
import { layoutClass } from './class/index.js';
import { layoutUseCase } from './usecase/index.js';
import { layoutState } from './state/index.js';
import { layoutContainer } from './container/index.js';
import { layoutActivity } from './activity/index.js';
import { layoutWbs } from './tree/wbs.js';
import { layoutMindmap } from './tree/mindmap.js';
import { layoutGantt } from './gantt/index.js';
import { layoutJson } from './json/index.js';
import { layoutYaml } from './yaml/index.js';
import { layoutEbnf, layoutRegex } from './grammar/index.js';
import { layoutTiming } from './timing/index.js';

export function layout(ast: DiagramAst): Scene {
  switch (ast.kind) {
    case 'sequence':   return layoutSequence(ast);
    case 'class':      return layoutClass(ast);
    case 'usecase':    return layoutUseCase(ast);
    case 'state':      return layoutState(ast);
    case 'component':
    case 'deployment':
    case 'object':     return layoutContainer(ast);
    case 'activity':   return layoutActivity(ast);
    case 'mindmap':    return layoutMindmap(ast);
    case 'wbs':        return layoutWbs(ast);
    case 'gantt':      return layoutGantt(ast);
    case 'json':       return layoutJson(ast);
    case 'yaml':       return layoutYaml(ast);
    case 'ebnf':       return layoutEbnf(ast);
    case 'regex':      return layoutRegex(ast);
    case 'timing':     return layoutTiming(ast);
    case 'unknown':
    case 'placeholder': return layoutPlaceholder(ast);
  }
}

const PAD = 16;
const FONT_SIZE = 14;
const CHAR_W = 7.2;

function layoutPlaceholder(ast: UnknownAst | PlaceholderAst): Scene {
  const message =
    ast.kind === 'unknown' ? `Unknown diagram: ${ast.reason}` : ast.label;
  const textWidth = Math.max(message.length * CHAR_W, 120);
  const width = textWidth + PAD * 2;
  const height = FONT_SIZE + PAD * 2;
  const children: Shape[] = [
    {
      type: 'rect',
      x: 0.5,
      y: 0.5,
      w: width - 1,
      h: height - 1,
      style: { stroke: '#888', strokeWidth: 1, fill: '#fafafa' },
    },
    {
      type: 'text',
      x: width / 2,
      y: height / 2,
      text: message,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: 'sans-serif', size: FONT_SIZE, color: '#333' },
    },
  ];
  return { width, height, background: '#ffffff', children };
}
