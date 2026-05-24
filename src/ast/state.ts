import type { EndMarker } from './class.js';

export type StateKind =
  | 'normal'
  | 'initial'
  | 'final'
  | 'choice'
  | 'fork'
  | 'join'
  | 'history';

export interface StateNode {
  id: string;
  name: string;
  stateKind: StateKind;
  children: StateNode[];
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
