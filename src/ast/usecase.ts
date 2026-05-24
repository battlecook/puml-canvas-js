import type { EndMarker } from './class.js';

export type UCNodeKind = 'actor' | 'usecase';

export interface UCNode {
  id: string;
  name: string;
  kind: UCNodeKind;
}

export interface UCRelationship {
  source: string;
  target: string;
  arrowToken: string;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
}

export interface UseCaseAst {
  kind: 'usecase';
  title: string;
  nodes: UCNode[];
  relationships: UCRelationship[];
}
