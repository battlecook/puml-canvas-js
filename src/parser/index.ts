import { tokenize } from '../lexer/index.js';
import type { DiagramAst } from '../ast/index.js';
import { detectKind } from './detect.js';
import { preprocessArchimateSource } from './archimate-preprocess.js';
import { parseSequence } from './sequence/index.js';
import { parseClass } from './class/index.js';
import { parseUseCase } from './usecase/index.js';
import { parseState } from './state/index.js';
import { parseComponent } from './container/component.js';
import { parseDeployment } from './container/deployment.js';
import { parseObject } from './container/object.js';
import { parseActivity } from './activity/index.js';
import { parseMindmap } from './mindmap/index.js';
import { parseWbs } from './wbs/index.js';
import { parseGantt } from './gantt/index.js';
import { parseJson } from './json/index.js';
import { parseYaml } from './yaml/index.js';
import { parseEbnf } from './grammar/ebnf.js';
import { parseRegex } from './grammar/regex.js';
import { parseTiming } from './timing/index.js';
import { parseNwdiag } from './nwdiag/index.js';
import { parseSalt } from './salt/index.js';

export function parse(source: string): DiagramAst {
  // Pre-pass: strip preprocessor directives we cannot honour (`!define`,
  // `!include`, sprite/legend/listsprite, stereotype-scoped skinparam blocks)
  // and expand the small set of hard-coded Archimate `Layer_Element(…)` /
  // `Rel_…(…)` macros into plain PlantUML the diagram parsers already
  // accept. Strips the `$` sigil from sprite-referencing stereotypes
  // (`<<$bProcess>>` → `<<bProcess>>`) and merges adjacent stereotype tags so
  // the existing single-stereotype regex still matches.
  // Detect a standalone `listsprite` directive before preprocessing strips it.
  // PlantUML renders a list of bundled sprites here; we don't bundle any, so
  // surface a placeholder text rather than letting the diagram collapse to
  // empty after the directive is removed.
  if (/^\s*listsprite\s*$/im.test(source)) {
    return {
      kind: 'placeholder',
      detected: 'component',
      label: '(sprite list — no sprites bundled)',
    };
  }
  source = preprocessArchimateSource(source);
  const detection = detectKind(tokenize(source));

  if (detection.kind === 'unknown') {
    return { kind: 'unknown', reason: 'No @start... wrapper found' };
  }

  if (detection.kind === 'sequence') {
    return parseSequence(source);
  }

  if (detection.kind === 'class') {
    return parseClass(source);
  }

  if (detection.kind === 'usecase') {
    return parseUseCase(source);
  }

  if (detection.kind === 'state') {
    return parseState(source);
  }

  if (detection.kind === 'component') {
    return parseComponent(source);
  }

  if (detection.kind === 'deployment') {
    return parseDeployment(source);
  }

  if (detection.kind === 'object') {
    return parseObject(source);
  }

  if (detection.kind === 'activity') {
    return parseActivity(source);
  }

  if (detection.kind === 'mindmap') {
    return parseMindmap(source);
  }

  if (detection.kind === 'wbs') {
    return parseWbs(source);
  }

  if (detection.kind === 'gantt') {
    return parseGantt(source);
  }

  if (detection.kind === 'json') {
    return parseJson(source);
  }

  if (detection.kind === 'yaml') {
    return parseYaml(source);
  }

  if (detection.kind === 'ebnf') {
    return parseEbnf(source);
  }

  if (detection.kind === 'regex') {
    return parseRegex(source);
  }

  if (detection.kind === 'timing') {
    return parseTiming(source);
  }

  if (detection.kind === 'nwdiag') {
    return parseNwdiag(source);
  }

  if (detection.kind === 'salt') {
    return parseSalt(source);
  }

  return {
    kind: 'placeholder',
    detected: detection.kind,
    label: `${detection.kind} — parser pending`,
  };
}

export { detectKind } from './detect.js';
export { parseSequence } from './sequence/index.js';
export { parseClass } from './class/index.js';
export { parseUseCase } from './usecase/index.js';
export { parseState } from './state/index.js';
export { parseComponent } from './container/component.js';
export { parseDeployment } from './container/deployment.js';
export { parseObject } from './container/object.js';
export { parseActivity } from './activity/index.js';
export { parseMindmap } from './mindmap/index.js';
export { parseWbs } from './wbs/index.js';
export { parseGantt } from './gantt/index.js';
export { parseJson } from './json/index.js';
export { parseYaml } from './yaml/index.js';
export { parseEbnf } from './grammar/ebnf.js';
export { parseRegex } from './grammar/regex.js';
export { parseTiming } from './timing/index.js';
export { parseNwdiag } from './nwdiag/index.js';
export { parseSalt } from './salt/index.js';
