export interface Style {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  fill?: string;
  opacity?: number;
}

export interface FontStyle {
  family?: string;
  size?: number;
  weight?: 'normal' | 'bold';
  style?: 'normal' | 'italic';
  color?: string;
}

export type TextAnchor = 'start' | 'middle' | 'end';
export type Baseline = 'alphabetic' | 'middle' | 'hanging';

export interface RectShape {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  ry?: number;
  style?: Style;
}

export interface CircleShape {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  style?: Style;
}

export interface EllipseShape {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  style?: Style;
}

export interface LineShape {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style?: Style;
}

export interface PolylineShape {
  type: 'polyline';
  points: Array<[number, number]>;
  style?: Style;
}

export interface PolygonShape {
  type: 'polygon';
  points: Array<[number, number]>;
  style?: Style;
}

export interface PathShape {
  type: 'path';
  d: string;
  style?: Style;
}

export interface TextShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  anchor?: TextAnchor;
  baseline?: Baseline;
  font?: FontStyle;
}

export interface GroupShape {
  type: 'group';
  children: Shape[];
  transform?: string;
}

export type Shape =
  | RectShape
  | CircleShape
  | EllipseShape
  | LineShape
  | PolylineShape
  | PolygonShape
  | PathShape
  | TextShape
  | GroupShape;

export interface Scene {
  width: number;
  height: number;
  background?: string;
  children: Shape[];
}
