import type { EndMarker } from './class.js';
import type { LabelBlock } from './usecase.js';

export type ContainerNodeKind =
  | 'component'
  | 'interface'
  | 'node'
  | 'cloud'
  | 'database'
  | 'folder'
  | 'frame'
  | 'rectangle'
  | 'object'
  | 'map'
  | 'artifact'
  | 'storage'
  | 'queue'
  | 'card'
  | 'usecase'
  | 'action'
  | 'agent'
  | 'hexagon'
  | 'process'
  | 'stack'
  | 'package';

export type ContainerLineStyle = 'solid' | 'dashed' | 'dotted' | 'bold';

export interface MapEntry {
  key: string;
  value: string;
}

export interface ContainerNode {
  id: string;
  name: string;
  nodeKind: ContainerNodeKind;
  attributes: string[];
  children: ContainerNode[];
  /** Populated only when nodeKind === 'map'. Each entry is one `key => value`
   * row inside a `map Name { ... }` block. */
  mapEntries?: MapEntry[];
  /**
   * Optional explicit background color from a trailing `#Color` suffix on the
   * declaration line (e.g. `component [Web Server] #Yellow`). Layout reads
   * this and overrides the kind's default fill when set. Stored as the raw
   * source token (`'Yellow'`, `'#FF0000'`, …).
   */
  color?: string;
  /**
   * Pre-parsed multi-line bracket label content (`folder f [ line one --- line
   * two ]`). When present, layout renders the box's interior as stacked text
   * rows + horizontal separators in place of the centered single-line name.
   */
  labelBlocks?: LabelBlock[];
  /**
   * Inline-style fields parsed from a multi-property `#`-prefixed suffix on a
   * declaration line, e.g. `cloud c #pink;line:red;line.bold;text:red`. These
   * mirror the state-diagram inline-style format (`StateNode.fill` etc.) so
   * the layout can apply the same set of overrides:
   *   - `fill` overrides the kind's default body fill (also accepts `back:`).
   *   - `lineColor` overrides the body stroke.
   *   - `lineStyle` selects the stroke pattern (`bold` → strokeWidth 2,
   *     `dashed`/`dotted` → matching dasharray).
   *   - `textColor` overrides the rendered label color.
   */
  fill?: string;
  lineColor?: string;
  lineStyle?: ContainerLineStyle;
  textColor?: string;
}

export interface ContainerRelationship {
  source: string;
  target: string;
  arrowToken: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
}

export interface ContainerAst {
  kind: 'component' | 'deployment' | 'object';
  title: string;
  nodes: ContainerNode[];
  relationships: ContainerRelationship[];
  /** Optional bottom footer text. Supports Creole markup (`//italic//`,
   * `**bold**`, `""mono""`, etc.) and `\n` for line breaks. */
  footer?: string;
}
