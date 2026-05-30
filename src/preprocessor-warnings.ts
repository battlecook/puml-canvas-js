import type { Scene, Shape } from './scene/types.js';

const DIRECTIVE_PATTERNS: Array<[RegExp, string]> = [
  [/^!theme\b/i, '!theme'],
  [/^!include(?:url|sub|_many)?\b/i, '!include'],
  [/^!define(?:long)?\b/i, '!define'],
  [/^!undef\b/i, '!undef'],
  [/^!pragma\b/i, '!pragma'],
  [/^!procedure\b/i, '!procedure'],
  [/^!function\b/i, '!function'],
  [/^!if\b/i, '!if'],
  [/^!elseif\b/i, '!elseif'],
  [/^!else\b/i, '!else'],
  [/^!endif\b/i, '!endif'],
  [/^!while\b/i, '!while'],
  [/^!foreach\b/i, '!foreach'],
  [/^!endfor\b/i, '!endfor'],
  [/^!endwhile\b/i, '!endwhile'],
  [/^!endprocedure\b/i, '!endprocedure'],
  [/^!endfunction\b/i, '!endfunction'],
  [/^!log\b/i, '!log'],
  [/^!assert\b/i, '!assert'],
  [/^!\$\w+/, '!$var'],
];

const GROUPED: Record<string, string> = {
  '!elseif': '!if',
  '!else': '!if',
  '!endif': '!if',
  '!endfor': '!foreach',
  '!endwhile': '!while',
  '!endprocedure': '!procedure',
  '!endfunction': '!function',
};

const ORDER = [
  '!theme', '!include', '!define', '!undef', '!pragma',
  '!procedure', '!function', '!if', '!while', '!foreach',
  '!$var', '!log', '!assert',
];

export function detectUnsupportedDirectives(source: string): string[] {
  const found = new Set<string>();
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line[0] !== '!') continue;
    for (const [re, name] of DIRECTIVE_PATTERNS) {
      if (re.test(line)) {
        found.add(GROUPED[name] ?? name);
        break;
      }
    }
  }
  return ORDER.filter((d) => found.has(d));
}

const FONT_SIZE = 11;
const PAD_X = 6;
const PAD_Y = 4;
const MARGIN = 8;

export function applyPreprocessorWarningBanner(scene: Scene, directives: string[]): Scene {
  if (directives.length === 0) return scene;

  const text = `Preprocessor not supported: ${directives.join(', ')}`;
  const textW = text.length * FONT_SIZE * 0.6;
  const bannerW = textW + PAD_X * 2;
  const bannerH = FONT_SIZE + PAD_Y * 2;

  const newWidth = Math.max(scene.width, bannerW + MARGIN * 2);
  const x = newWidth - bannerW - MARGIN;
  const y = MARGIN;

  const banner: Shape[] = [
    {
      type: 'rect',
      x, y, w: bannerW, h: bannerH,
      rx: 3, ry: 3,
      style: { fill: '#fff3cd', stroke: '#d39e00', strokeWidth: 1 },
    },
    {
      type: 'text',
      x: x + PAD_X,
      y: y + PAD_Y + FONT_SIZE * 0.85,
      text,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: 'sans-serif', size: FONT_SIZE, color: '#7a5a00' },
    },
  ];

  return {
    ...scene,
    width: newWidth,
    children: [...scene.children, ...banner],
  };
}
