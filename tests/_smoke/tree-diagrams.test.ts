import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';

const MINDMAP = `@startmindmap
* Omni Viewer roadmap
** File types
*** UML
**** PlantUML
**** Mermaid
*** Documents
**** HWPX
**** PDF
*** Data
**** JSONL
**** CSV
** Rendering
*** Native widgets
*** Web fallback
*** Snapshot cache
** Quality
*** Golden samples
*** Fuzzing
*** Accessibility
**** Keyboard
**** Screen reader
** Release
*** Android
*** iOS
*** Web
@endmindmap`;

const WBS = `@startwbs
* PlantUML support
** Resolver
*** Extension match
*** MIME sniff
** Router
*** Feature page registration
*** Deep link
** Viewer
*** Source tab
*** Diagram tab
*** Error panel
** Samples
*** Basic UML
*** Advanced syntax
*** Non-UML formats
@endwbs`;

describe('tree diagrams (user repro)', () => {
  it('parses mindmap with deep tree', () => {
    const ast = parseToAst(MINDMAP);
    expect(ast.kind).toBe('mindmap');
    if (ast.kind === 'mindmap') {
      expect(ast.root?.text).toBe('Omni Viewer roadmap');
      expect(ast.root?.children).toHaveLength(4);
      const fileTypes = ast.root!.children[0]!;
      expect(fileTypes.text).toBe('File types');
      expect(fileTypes.children[0]?.children).toHaveLength(2);
    }
  });

  it('parses wbs hierarchy', () => {
    const ast = parseToAst(WBS);
    expect(ast.kind).toBe('wbs');
    if (ast.kind === 'wbs') {
      expect(ast.root?.text).toBe('PlantUML support');
      expect(ast.root?.children).toHaveLength(4);
    }
  });

  it('renders mindmap to a reasonably-sized scene', () => {
    const scene = compile(MINDMAP);
    expect(scene.width).toBeGreaterThan(400);
    expect(scene.height).toBeGreaterThan(300);
    expect(scene.children.length).toBeGreaterThan(30);
  });

  it('renders wbs to a reasonably-sized scene', () => {
    const scene = compile(WBS);
    expect(scene.width).toBeGreaterThan(400);
    expect(scene.height).toBeGreaterThan(150);
    expect(scene.children.length).toBeGreaterThan(20);
  });
});
