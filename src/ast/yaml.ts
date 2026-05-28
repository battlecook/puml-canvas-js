export interface YamlAst {
  kind: 'yaml';
  title: string;
  data: unknown;
  highlights: string[][];
  parseError: string;
  /**
   * Optional style declarations lifted from `<style>...</style>` blocks.
   * Keys are flat dotted paths in lowercase (e.g. `yamldiagram.node.backgroundcolor`,
   * `yamldiagram.node.separator.linecolor`). Values are the raw token tail.
   * Last write wins for duplicate keys.
   */
  styles?: Record<string, string>;
}
