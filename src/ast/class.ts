export type ClassKind = 'class' | 'interface' | 'enum' | 'abstract' | 'annotation' | 'record';

export type Visibility = 'public' | 'private' | 'protected' | 'package' | 'none';

export interface ClassMember {
  memberKind: 'field' | 'method';
  visibility: Visibility;
  name: string;
  type: string;
  params: string;
  isStatic: boolean;
  isAbstract: boolean;
}

export interface EnumConstant {
  name: string;
}

export interface ClassDecl {
  id: string;
  name: string;
  classKind: ClassKind;
  stereotype: string;
  members: ClassMember[];
  enumConstants: EnumConstant[];
}

export type RelationKind =
  | 'inheritance'
  | 'realization'
  | 'association'
  | 'dependency'
  | 'composition'
  | 'aggregation';

export type EndMarker =
  | 'none'
  | 'arrow'
  | 'triangle'
  | 'diamond-filled'
  | 'diamond-open';

export interface ClassRelationship {
  source: string;
  target: string;
  sourceMult: string;
  targetMult: string;
  arrowToken: string;
  kind: RelationKind;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
}

export interface ClassAst {
  kind: 'class';
  title: string;
  classes: ClassDecl[];
  relationships: ClassRelationship[];
}
