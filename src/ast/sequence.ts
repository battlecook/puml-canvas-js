export type ParticipantShape =
  | 'participant'
  | 'actor'
  | 'boundary'
  | 'control'
  | 'entity'
  | 'database'
  | 'queue'
  | 'collections';

export interface Participant {
  id: string;
  label: string;
  shape: ParticipantShape;
}

export type ArrowStyle = 'solid' | 'dashed';

export interface MessageStmt {
  type: 'message';
  from: string;
  to: string;
  text: string;
  style: ArrowStyle;
  reverse: boolean;
}

export type NotePosition = 'left' | 'right' | 'over';

export interface NoteStmt {
  type: 'note';
  position: NotePosition;
  targets: [string] | [string, string];
  text: string;
}

export interface ActivateStmt {
  type: 'activate';
  target: string;
}

export interface DeactivateStmt {
  type: 'deactivate';
  target: string;
}

export type GroupKind =
  | 'group'
  | 'alt'
  | 'opt'
  | 'loop'
  | 'par'
  | 'break'
  | 'critical';

export interface GroupStartStmt {
  type: 'groupStart';
  kind: GroupKind;
  label: string;
}

export interface GroupElseStmt {
  type: 'groupElse';
  label: string;
}

export interface GroupEndStmt {
  type: 'groupEnd';
}

export interface AutoNumberStmt {
  type: 'autonumber';
  start: number;
  step: number;
}

export interface DividerStmt {
  type: 'divider';
  label: string;
}

export type SequenceStatement =
  | MessageStmt
  | NoteStmt
  | ActivateStmt
  | DeactivateStmt
  | GroupStartStmt
  | GroupElseStmt
  | GroupEndStmt
  | AutoNumberStmt
  | DividerStmt;

export interface SequenceAst {
  kind: 'sequence';
  title: string;
  participants: Participant[];
  statements: SequenceStatement[];
}
