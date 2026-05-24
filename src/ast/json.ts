export interface JsonAst {
  kind: 'json';
  title: string;
  data: unknown;
  highlights: string[][];
  parseError: string;
}
