import type { YamlAst } from '../../ast/yaml.js';
import type { Scene } from '../../scene/types.js';
import { layoutKvTree } from '../json/index.js';

export function layoutYaml(ast: YamlAst): Scene {
  return layoutKvTree({
    title: ast.title,
    data: ast.data,
    highlights: ast.highlights,
    parseError: ast.parseError,
    errorLabel: 'YAML parse error',
  });
}
