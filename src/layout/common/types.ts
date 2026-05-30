import type { EndMarker, LabelDirection } from '../../ast/class.js';

export interface Position {
  x: number;
  y: number;
}

export interface NodeCenter {
  cx: number;
  cy: number;
}

export interface BoxSize {
  w: number;
  h: number;
}

export interface EdgeAttrs {
  source: string;
  target: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
  sourceMult?: string;
  targetMult?: string;
  labelDirection?: LabelDirection;
  /**
   * Per-edge stroke colour override. When set, takes precedence over the
   * diagram-wide `EdgeStyle.color` for the line, arrow head, and any
   * multiplicity glyphs of this edge. Use case diagrams populate this from an
   * inline `#<styleBlock>` between the target and the `:` label.
   */
  lineColor?: string;
  /**
   * Per-edge line-style override mirroring the four PlantUML inline-style
   * tokens. Overrides the structural `style` for rendering only — the
   * underlying `style` still classifies the arrow's semantic kind (e.g.
   * dependency vs. association).
   *
   * - `'solid'` / `'dashed'` — render normal-weight stroke, dasharray follows
   *   the name.
   * - `'dotted'` — short-dash dasharray (`2,2`).
   * - `'bold'` — thicker stroke with no dasharray.
   */
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  /**
   * Per-edge text colour override for the label, mapped from the
   * `text:<colorName>` token of an inline `#<styleBlock>`.
   */
  textColor?: string;
}

export interface EdgeStyle {
  color: string;
  fontFamily: string;
  labelFontSize: number;
  /**
   * Optional color override for the arrow-head / triangle / diamond glyph.
   * When omitted, the marker module's default (#222) is used. Use case
   * diagrams set this from `skinparam ArrowColor` so the arrowhead matches
   * the (recolored) line stroke.
   */
  markerColor?: string;
}
