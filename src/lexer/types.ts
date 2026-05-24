export type TokenKind =
  | 'WrapperStart'
  | 'WrapperEnd'
  | 'Identifier'
  | 'String'
  | 'Number'
  | 'Symbol'
  | 'Colon'
  | 'Newline'
  | 'EOF';

export interface Position {
  line: number;
  column: number;
}

export interface Token {
  kind: TokenKind;
  value: string;
  pos: Position;
}
