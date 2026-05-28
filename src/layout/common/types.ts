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
