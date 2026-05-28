import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

const SAMPLE = [
  '@startjson',
  '<style>',
  '.h1 { BackGroundColor green FontColor white FontStyle italic }',
  '.h2 { BackGroundColor red FontColor white FontStyle bold }',
  '</style>',
  '#highlight "lastName"',
  '#highlight "address" / "city" <<h1>>',
  '#highlight "phoneNumbers" / "0" / "number" <<h2>>',
  '{ "firstName": "John", "lastName": "Smith", "isAlive": true, "age": 28, "address": { "streetAddress": "21 2nd Street", "city": "New York", "state": "NY", "postalCode": "10021-3100" }, "phoneNumbers": [ { "type": "home", "number": "212 555-1234" }, { "type": "office", "number": "646 555-4567" } ], "children": [], "spouse": null }',
  '@endjson',
].join('\n');

describe('json layout with <style> classes', () => {
  it('renders default yellow-ish highlight for un-classed #highlight rows', () => {
    const scene = compile(SAMPLE);
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    // Default highlight fill stays the original light-green sentinel.
    const defaultHi = rects.find(
      (r) => (r as { style: { fill?: string } }).style.fill === '#d6f0c8',
    );
    expect(defaultHi).toBeTruthy();
  });

  it('applies class background color to value cells', () => {
    const scene = compile(SAMPLE);
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    const fills = rects.map((r) => (r as { style: { fill?: string } }).style.fill);
    // .h1 -> green, .h2 -> red (named CSS colors, passed through verbatim).
    expect(fills).toContain('green');
    expect(fills).toContain('red');
  });

  it('applies class font color, weight, and style to highlighted value text', () => {
    const scene = compile(SAMPLE);
    const texts = scene.children.filter((s: Shape) => s.type === 'text') as Array<{
      text: string;
      font?: { color?: string; weight?: string; style?: string };
    }>;
    // address.city -> .h1: white italic
    const cityText = texts.find((t) => t.text === '"New York"');
    expect(cityText?.font?.color).toBe('white');
    expect(cityText?.font?.style).toBe('italic');
    // phoneNumbers[0].number -> .h2: white bold
    const numberText = texts.find((t) => t.text === '"212 555-1234"');
    expect(numberText?.font?.color).toBe('white');
    expect(numberText?.font?.weight).toBe('bold');
  });

  it('keeps existing 25 JSON examples behavior: still parses inline single-line bodies', () => {
    const scene = compile('@startjson\n{"k": 1}\n@endjson');
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('k');
    expect(texts).toContain('1');
  });
});
