import type { EndMarker } from './class.js';

export type StateKind =
  | 'normal'
  | 'initial'
  | 'final'
  | 'choice'
  | 'fork'
  | 'join'
  | 'history';

export type StateLineStyle = 'solid' | 'dashed' | 'dotted' | 'bold';

export interface StateNode {
  id: string;
  name: string;
  stateKind: StateKind;
  children: StateNode[];
  description?: string;
  fill?: string;
  lineColor?: string;
  lineStyle?: StateLineStyle;
  textColor?: string;
}

export interface StateTransition {
  source: string;
  target: string;
  arrowToken: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
}

export interface StateAst {
  kind: 'state';
  title: string;
  states: StateNode[];
  transitions: StateTransition[];
}
