export type SaltWidget =
  | { kind: 'text'; text: string }
  | { kind: 'button'; label: string }
  | { kind: 'radio'; checked: boolean }
  | { kind: 'checkbox'; checked: boolean }
  | { kind: 'textfield'; text: string }
  | { kind: 'droplist'; label: string };

export interface SaltAst {
  kind: 'salt';
  rows: SaltWidget[];
}
