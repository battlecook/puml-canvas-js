import { describe, it, expect } from 'vitest';
import { parseLabelMarkup, drawLabelSpans } from '../../src/layout/sequence/markup.js';
import { compile } from '../../src/index.js';

describe('parseLabelMarkup — PlantUML extensions', () => {
  it('substitutes <U+221E> as the actual codepoint', () => {
    const spans = parseLabelMarkup('inf <U+221E> end');
    expect(spans.length).toBeGreaterThan(0);
    const joined = spans.map((s) => s.text).join('');
    expect(joined).toContain('∞');
    expect(joined).not.toContain('<U+');
  });

  it('maps known OpenIconic names and falls back to a glyph for unknown', () => {
    const known = parseLabelMarkup('<&account-login>');
    expect(known[0]!.text.length).toBeGreaterThan(0);
    expect(known[0]!.text).not.toContain('<');

    const unknown = parseLabelMarkup('<&this-icon-does-not-exist>');
    expect(unknown[0]!.text).not.toContain('<');
    expect(unknown[0]!.text.length).toBeGreaterThan(0);
  });

  it('maps known emoji names and falls back to [name] for unknown', () => {
    const known = parseLabelMarkup('<:calendar:>');
    expect(known[0]!.text).toBe('\u{1F4C5}');

    const unknown = parseLabelMarkup('<:no-such-emoji:>');
    expect(unknown[0]!.text).toBe('[no-such-emoji]');
  });

  it('captures <img:URL> as [img] placeholder with URL on the span', () => {
    const spans = parseLabelMarkup('see <img:https://example.com/x.png> here');
    const imgSpan = spans.find((s) => s.text === '[img]');
    expect(imgSpan).toBeDefined();
    expect(imgSpan!.imgUrl).toBe('https://example.com/x.png');
  });

  it('parses <font:monospaced> as the monospace family', () => {
    const spans = parseLabelMarkup('<font:monospaced>code');
    expect(spans[0]!.text).toBe('code');
    expect(spans[0]!.family).toBe('monospace');
  });

  it('parses <color:blue> and applies it to subsequent text', () => {
    const spans = parseLabelMarkup('<color:blue>Blue');
    expect(spans[0]!.color).toBe('blue');
    expect(spans[0]!.text).toBe('Blue');
  });

  it('parses <back:orange> as a background color on the span', () => {
    const spans = parseLabelMarkup('<back:orange>highlighted');
    expect(spans[0]!.bgColor).toBe('orange');
    expect(spans[0]!.text).toBe('highlighted');
  });

  it('parses <size:20> as a numeric font size override', () => {
    const spans = parseLabelMarkup('<size:20>big');
    expect(spans[0]!.size).toBe(20);
    expect(spans[0]!.text).toBe('big');
  });

  it('parses <u:red>x</u> as a colored underline', () => {
    const spans = parseLabelMarkup('<u:red>x</u>');
    expect(spans[0]!.underline).toBe(true);
    expect(spans[0]!.underlineColor).toBe('red');
  });

  it('parses <s:green>x</s> as a colored strike', () => {
    const spans = parseLabelMarkup('<s:green>x</s>');
    expect(spans[0]!.strike).toBe(true);
    expect(spans[0]!.strikeColor).toBe('green');
  });

  it('parses <w>x</w> as a wavy underline (no color)', () => {
    const spans = parseLabelMarkup('<w>x</w>');
    expect(spans[0]!.waved).toBe(true);
    expect(spans[0]!.waveColor).toBeUndefined();
  });

  it('parses <w:#0000FF>x</w> as a wavy underline with color', () => {
    const spans = parseLabelMarkup('<w:#0000FF>x</w>');
    expect(spans[0]!.waved).toBe(true);
    expect(spans[0]!.waveColor).toBe('#0000FF');
  });

  it('honours `~__not underlined__` creole escape', () => {
    const spans = parseLabelMarkup('a ~__not underlined__ b');
    const anyUnderlined = spans.some((s) => s.underline);
    expect(anyUnderlined).toBe(false);
    const joined = spans.map((s) => s.text).join('');
    expect(joined).toContain('__not underlined__');
  });

  it('renders `<<text>>` as `«text»` in an italic span (PlantUML stereotype)', () => {
    const spans = parseLabelMarkup('<< createRequest >>');
    const guillemetSpan = spans.find((s) => s.text.includes('«'));
    expect(guillemetSpan).toBeDefined();
    expect(guillemetSpan!.text).toBe('«createRequest»');
    expect(guillemetSpan!.italic).toBe(true);
    // The opening `<<` MUST NOT have been swallowed as an HTML tag opener,
    // which would have left the visible text as `<>`.
    const joined = spans.map((s) => s.text).join('');
    expect(joined).not.toBe('<>');
    expect(joined).not.toContain('<<');
  });

  it('renders `<<text>>` mixed with surrounding plain text', () => {
    const spans = parseLabelMarkup('A -> B: << createRequest >> tail');
    const joined = spans.map((s) => s.text).join('');
    expect(joined).toContain('«createRequest»');
    expect(joined).toContain('tail');
    expect(joined).not.toContain('<<');
    expect(joined).not.toContain('>>');
  });
});

describe('drawLabelSpans — extended styling', () => {
  it('emits a background rect for spans with bgColor', () => {
    const spans = parseLabelMarkup('<back:orange>hi');
    const shapes = drawLabelSpans(spans, 0, 0, 'start');
    const rects = shapes.filter((s) => s.type === 'rect');
    expect(rects.length).toBe(1);
    expect((rects[0] as { style?: { fill?: string } }).style?.fill).toBe('orange');
  });

  it('uses underlineColor on the underline line, not the text color', () => {
    const spans = parseLabelMarkup('<u:red>x</u>');
    const shapes = drawLabelSpans(spans, 0, 0, 'start');
    const lines = shapes.filter((s) => s.type === 'line') as Array<{ style?: { stroke?: string } }>;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.style?.stroke).toBe('red');
  });

  it('applies size override to the text shape', () => {
    const spans = parseLabelMarkup('<size:20>big');
    const shapes = drawLabelSpans(spans, 0, 0, 'start');
    const text = shapes.find((s) => s.type === 'text') as { font?: { size?: number } };
    expect(text.font?.size).toBe(20);
  });

  it('applies the chosen family to the text shape (font:monospaced)', () => {
    const spans = parseLabelMarkup('<font:monospaced>code');
    const shapes = drawLabelSpans(spans, 0, 0, 'start');
    const text = shapes.find((s) => s.type === 'text') as { font?: { family?: string } };
    expect(text.font?.family).toBe('monospace');
  });
});

describe('activity layout — full extended-markup repro', () => {
  const SRC = [
    '@startuml',
    ':Creole: wave: ~~wave~~ bold: **bold** italics: //italics// monospaced: ""monospaced"" stricken-out: --stricken-out-- underlined: __underlined__ not-underlined: ~__not underlined__ wave-underlined: ~~wave-underlined~~;',
    ':HTML Creole: bold: <b>bold italics: <i>italics monospaced: <font:monospaced>monospaced stroked: <s>stroked underlined: <u>underlined waved: <w>waved green-stroked: <s:green>stroked red-underlined: <u:red>underlined blue-waved: <w:#0000FF>waved Blue: <color:blue>Blue Orange: <back:orange>Orange background big: <size:20>big;',
    ':Graphic: OpenIconic: account-login <&account-login> Unicode: This is <U+221E> long Emoji: <:calendar:> Calendar Image: <img:https://plantuml.com/logo3.png>;',
    '@enduml',
  ].join('\n');

  it('compiles without throwing', () => {
    expect(() => compile(SRC)).not.toThrow();
  });

  it('renders bold, italic, mono, wave, underline, strike spans', () => {
    const scene = compile(SRC);
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{
      text: string;
      font?: { weight?: string; style?: string; family?: string; size?: number; color?: string };
    }>;
    expect(texts.some((t) => t.font?.weight === 'bold')).toBe(true);
    expect(texts.some((t) => t.font?.style === 'italic')).toBe(true);
    expect(texts.some((t) => t.font?.family === 'monospace')).toBe(true);
  });

  it('renders <color:blue>Blue with a blue text span', () => {
    const scene = compile(SRC);
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{
      text: string;
      font?: { color?: string };
    }>;
    expect(texts.some((t) => t.font?.color === 'blue')).toBe(true);
  });

  it('renders <back:orange> as at least one orange-filled rect behind text', () => {
    const scene = compile(SRC);
    const rects = scene.children.filter((s) => s.type === 'rect') as Array<{
      style?: { fill?: string };
    }>;
    expect(rects.some((r) => r.style?.fill === 'orange')).toBe(true);
  });

  it('renders <size:20>big with a text shape sized 20', () => {
    const scene = compile(SRC);
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{
      text: string;
      font?: { size?: number };
    }>;
    expect(texts.some((t) => t.font?.size === 20)).toBe(true);
  });

  it('substitutes <U+221E> as the literal infinity character', () => {
    const scene = compile(SRC);
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{ text: string }>;
    const joined = texts.map((t) => t.text).join('');
    expect(joined).toContain('∞');
  });

  it('substitutes <:calendar:> as the calendar emoji', () => {
    const scene = compile(SRC);
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{ text: string }>;
    const joined = texts.map((t) => t.text).join('');
    expect(joined).toContain('\u{1F4C5}');
  });

  it('renders <img:url> as an inline image shape carrying the URL', () => {
    const scene = compile(SRC);
    const images = scene.children.filter((s) => s.type === 'image') as Array<{
      href: string; w: number; h: number;
    }>;
    expect(images.some((img) => img.href === 'https://plantuml.com/logo3.png')).toBe(true);
    // The literal `[img]` placeholder text should NOT be in the scene anymore.
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{ text: string }>;
    const joined = texts.map((t) => t.text).join('');
    expect(joined).not.toContain('[img]');
  });
});

describe('sequence note — inline <img:url>', () => {
  it('emits an image shape with the URL when a note contains <img:url>', () => {
    const src = [
      '@startuml',
      'Alice -> Bob: hi',
      'note over Bob',
      '  see <img:https://example.com/pic.png> please',
      'end note',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const images = scene.children.filter((s) => s.type === 'image') as Array<{
      href: string; w: number; h: number;
    }>;
    expect(images.length).toBeGreaterThan(0);
    const match = images.find((img) => img.href === 'https://example.com/pic.png');
    expect(match).toBeDefined();
    expect(match!.w).toBeGreaterThan(0);
    expect(match!.h).toBeGreaterThan(0);
  });
});
