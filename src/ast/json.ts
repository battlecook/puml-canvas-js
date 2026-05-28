export interface JsonHighlight {
  path: string[];
  className?: string;
}

export interface JsonAst {
  kind: 'json';
  title: string;
  data: unknown;
  highlights: string[][];
  /** Parallel to `highlights`: optional class name reference per highlight. */
  highlightClassNames: Array<string | undefined>;
  /** CSS-like class table parsed from a `<style>` block. Keys are class names
   * (without the leading dot). Inner keys are property names lowercased. */
  styles: Record<string, Record<string, string>>;
  parseError: string;
}
