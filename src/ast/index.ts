export type DiagramKind =
  | 'sequence'
  | 'class'
  | 'activity'
  | 'usecase'
  | 'state'
  | 'component'
  | 'object'
  | 'deployment'
  | 'mindmap'
  | 'gantt'
  | 'salt'
  | 'json'
  | 'yaml'
  | 'wbs'
  | 'ebnf'
  | 'regex'
  | 'timing';

export interface UnknownAst {
  kind: 'unknown';
  reason: string;
}

export interface PlaceholderAst {
  kind: 'placeholder';
  detected: DiagramKind;
  label: string;
}

export type DiagramAst =
  | UnknownAst
  | PlaceholderAst
  | import('./sequence.js').SequenceAst
  | import('./class.js').ClassAst
  | import('./usecase.js').UseCaseAst
  | import('./state.js').StateAst
  | import('./container.js').ContainerAst
  | import('./activity.js').ActivityAst
  | import('./tree.js').MindmapAst
  | import('./tree.js').WbsAst
  | import('./gantt.js').GanttAst
  | import('./json.js').JsonAst
  | import('./yaml.js').YamlAst
  | import('./grammar.js').EbnfAst
  | import('./grammar.js').RegexAst
  | import('./timing.js').TimingAst;

export type {
  ParticipantShape,
  Participant,
  ArrowStyle,
  MessageStmt,
  NotePosition,
  NoteStmt,
  ActivateStmt,
  DeactivateStmt,
  GroupKind,
  GroupStartStmt,
  GroupElseStmt,
  GroupEndStmt,
  AutoNumberStmt,
  DividerStmt,
  SequenceStatement,
  SequenceAst,
} from './sequence.js';

export type {
  ClassKind,
  Visibility,
  ClassMember,
  EnumConstant,
  ClassDecl,
  ClassAst,
  RelationKind,
  EndMarker,
  ClassRelationship,
} from './class.js';

export type {
  UCNodeKind,
  UCNode,
  UCRelationship,
  UCContainer,
  UseCaseAst,
} from './usecase.js';

export type {
  StateKind,
  StateNode,
  StateTransition,
  StateAst,
} from './state.js';

export type {
  ContainerNodeKind,
  ContainerNode,
  ContainerRelationship,
  ContainerAst,
} from './container.js';

export type {
  ActionNode,
  StartNode,
  StopNode,
  EndNode,
  IfBranch,
  IfNode,
  WhileNode,
  RepeatNode,
  ForkNode,
  DetachNode,
  KillNode,
  BreakNode,
  PartitionNode,
  ActivityNode,
  ActivityAst,
} from './activity.js';

export type {
  TreeNode,
  MindmapAst,
  WbsAst,
} from './tree.js';

export type {
  WeekdayName,
  GanttTask,
  GanttAst,
} from './gantt.js';

export type { JsonAst } from './json.js';

export type { YamlAst } from './yaml.js';

export type {
  TimingTrackKind,
  TimingTrack,
  TimingEvent,
  TimingAst,
} from './timing.js';

export type { EbnfRule, EbnfAst, RegexAst } from './grammar.js';
