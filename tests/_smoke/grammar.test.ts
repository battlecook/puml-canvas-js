import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';

const EBNF = `@startebnf
title Mini PlantUML subset grammar

diagram = start_directive , { statement } , end_directive ;
start_directive = "@startuml" | "@startjson" | "@startyaml" ;
end_directive = "@enduml" | "@endjson" | "@endyaml" ;
statement = participant | message | block | note | raw_line ;
participant = ( "participant" | "actor" | "database" ) , quoted_name , [ "as" , identifier ] ;
message = identifier , arrow , identifier , ":" , text ;
arrow = "->" | "-->" | "<-" | "<--" | "->>" ;
block = ( "alt" | "loop" | "par" | "group" ) , text , { statement } , "end" ;
note = "note" , ( "left" | "right" | "over" ) , text , "end note" ;
identifier = letter , { letter | digit | "_" } ;
quoted_name = '"' , { ? any character except quote ? } , '"' ;
@endebnf`;

const REGEX = `@startregex
title Practical PlantUML file detector

^\\s*@start(?:uml|json|yaml|gantt|mindmap|wbs|ebnf|regex|salt|dot)\\b
@endregex`;

describe('ebnf (user repro)', () => {
  it('detects + parses 11 rules', () => {
    const ast = parseToAst(EBNF);
    expect(ast.kind).toBe('ebnf');
    if (ast.kind === 'ebnf') {
      expect(ast.title).toBe('Mini PlantUML subset grammar');
      expect(ast.rules.length).toBeGreaterThanOrEqual(11);
      const names = ast.rules.map((r) => r.name);
      expect(names).toContain('diagram');
      expect(names).toContain('arrow');
      expect(names).toContain('quoted_name');
    }
  });

  it('renders to a railroad scene with curves and dots', () => {
    const scene = compile(EBNF);
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.height).toBeGreaterThan(400);
    const circles = scene.children.filter((s) => s.type === 'circle').length;
    expect(circles).toBeGreaterThanOrEqual(22); // 11 rules × 2 dots
    const paths = scene.children.filter((s) => s.type === 'path').length;
    expect(paths).toBeGreaterThan(0); // alternation/repetition curves
  });
});

describe('regex (user repro)', () => {
  it('detects + captures pattern', () => {
    const ast = parseToAst(REGEX);
    expect(ast.kind).toBe('regex');
    if (ast.kind === 'regex') {
      expect(ast.title).toBe('Practical PlantUML file detector');
      expect(ast.pattern).toContain('@start');
      expect(ast.pattern).toContain('mindmap');
    }
  });

  it('renders to a railroad scene with start/end dots and curves', () => {
    const scene = compile(REGEX);
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.height).toBeGreaterThan(60);
    const circles = scene.children.filter((s) => s.type === 'circle').length;
    expect(circles).toBeGreaterThanOrEqual(2); // start + end dots
    const paths = scene.children.filter((s) => s.type === 'path').length;
    expect(paths).toBeGreaterThan(0); // alternation curves
  });
});
