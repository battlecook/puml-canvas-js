export interface YamlAst {
  kind: 'yaml';
  title: string;
  data: unknown;
  highlights: string[][];
  parseError: string;
}
