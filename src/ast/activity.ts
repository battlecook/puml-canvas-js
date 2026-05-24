export interface ActionNode {
  type: 'action';
  text: string;
}

export interface StartNode {
  type: 'start';
}

export interface StopNode {
  type: 'stop';
}

export interface EndNode {
  type: 'end';
}

export interface IfBranch {
  label: string;
  body: ActivityNode[];
}

export interface IfNode {
  type: 'if';
  condition: string;
  branches: IfBranch[];
  elseBranch: IfBranch | null;
}

export interface WhileNode {
  type: 'while';
  condition: string;
  yesLabel: string;
  noLabel: string;
  body: ActivityNode[];
}

export interface RepeatNode {
  type: 'repeat';
  body: ActivityNode[];
  condition: string;
  yesLabel: string;
  noLabel: string;
}

export interface ForkNode {
  type: 'fork';
  branches: ActivityNode[][];
  merge: boolean;
}

export interface DetachNode {
  type: 'detach';
}

export interface KillNode {
  type: 'kill';
}

export interface BreakNode {
  type: 'break';
}

export interface PartitionNode {
  type: 'partition';
  name: string;
  body: ActivityNode[];
}

export type ActivityNode =
  | ActionNode
  | StartNode
  | StopNode
  | EndNode
  | IfNode
  | WhileNode
  | RepeatNode
  | ForkNode
  | DetachNode
  | KillNode
  | BreakNode
  | PartitionNode;

export interface ActivityAst {
  kind: 'activity';
  title: string;
  body: ActivityNode[];
}
