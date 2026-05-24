import { describe, it, expect } from 'vitest';
import { SvgRenderer } from '../../src/render/svg/index.js';
import type { Scene } from '../../src/scene/types.js';

describe('SvgRenderer', () => {
  it('renders a scene to an <svg> root with width/height/viewBox', () => {
    const scene: Scene = { width: 100, height: 50, children: [] };
    const svg = new SvgRenderer().render(scene);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('100');
    expect(svg.getAttribute('height')).toBe('50');
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 50');
  });

  it('renders rect, line, text primitives', () => {
    const scene: Scene = {
      width: 200, height: 100,
      children: [
        { type: 'rect', x: 0, y: 0, w: 50, h: 50, style: { fill: 'red' } },
        { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 },
        { type: 'text', x: 10, y: 20, text: 'hi', anchor: 'middle' },
      ],
    };
    const svg = new SvgRenderer().render(scene);
    expect(svg.querySelector('rect')).toBeTruthy();
    expect(svg.querySelector('line')).toBeTruthy();
    const text = svg.querySelector('text');
    expect(text?.textContent).toBe('hi');
    expect(text?.getAttribute('text-anchor')).toBe('middle');
  });

  it('renders nested groups with transform', () => {
    const scene: Scene = {
      width: 10, height: 10,
      children: [
        { type: 'group', transform: 'translate(5,5)', children: [
          { type: 'rect', x: 0, y: 0, w: 1, h: 1 },
        ] },
      ],
    };
    const svg = new SvgRenderer().render(scene);
    const g = svg.querySelector('g');
    expect(g?.getAttribute('transform')).toBe('translate(5,5)');
    expect(g?.querySelector('rect')).toBeTruthy();
  });

  it('paints background when scene.background is set', () => {
    const scene: Scene = { width: 10, height: 10, background: '#eee', children: [] };
    const svg = new SvgRenderer().render(scene);
    const bg = svg.querySelector('rect');
    expect(bg?.getAttribute('fill')).toBe('#eee');
  });
});
