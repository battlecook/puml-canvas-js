export interface EbnfRule {
  name: string;
  body: string;
}

export interface EbnfAst {
  kind: 'ebnf';
  title: string;
  rules: EbnfRule[];
}

export interface RegexAst {
  kind: 'regex';
  title: string;
  pattern: string;
}
