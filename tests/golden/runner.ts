import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';
import { render } from '../../src/index.js';

const GOLDEN_DIR = join(import.meta.dirname ?? __dirname, 'fixtures');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

export function expectGolden(name: string, source: string): void {
  const path = join(GOLDEN_DIR, `${name}.svg`);
  const svg = render(source);
  const actual = serialize(svg);

  if (UPDATE || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, 'utf8');
    return;
  }
  const expected = readFileSync(path, 'utf8');
  expect(actual).toBe(expected);
}

function serialize(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}
