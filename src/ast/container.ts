import type { EndMarker } from './class.js';

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
  | 'artifact'
  | 'storage'
  | 'queue';

export interface ContainerNode {
  id: string;
  name: string;
  nodeKind: ContainerNodeKind;
  attributes: string[];
  children: ContainerNode[];
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
}
