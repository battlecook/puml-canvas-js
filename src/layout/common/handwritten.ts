import type { Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

/**
 * `skinparam handwritten true` — we don't actually render in a handwritten
 * style, but we mirror upstream PlantUML by emitting a small yellow notice
 * box at the very top of the diagram pointing the user at the `!option`
 * form. Shared between sequence- and use-case-diagram layouts.
 */
export const HANDWRITTEN_NOTICE_TEXT =
  "Please use '!option handwritten true' to enable handwritten";
export const HANDWRITTEN_NOTICE_FONT_SIZE = 10;
export const HANDWRITTEN_NOTICE_PAD_X = 6;
export const HANDWRITTEN_NOTICE_PAD_Y = 3;
export const HANDWRITTEN_NOTICE_GAP = 6;

/** Total vertical space (box + gap) reserved at the top of the diagram. */
export function handwrittenNoticeHeight(): number {
  return HANDWRITTEN_NOTICE_FONT_SIZE + HANDWRITTEN_NOTICE_PAD_Y * 2 + HANDWRITTEN_NOTICE_GAP;
}

/** Width of the notice box (text + horizontal padding). */
export function handwrittenNoticeWidth(): number {
  const textW = measureText(HANDWRITTEN_NOTICE_TEXT, HANDWRITTEN_NOTICE_FONT_SIZE).width;
  return textW + HANDWRITTEN_NOTICE_PAD_X * 2;
}

/** Build the notice's rect + text shapes anchored at (x, y). */
export function buildHandwrittenNoticeShapes(x: number, y: number): Shape[] {
  const boxW = handwrittenNoticeWidth();
  const boxH = HANDWRITTEN_NOTICE_FONT_SIZE + HANDWRITTEN_NOTICE_PAD_Y * 2;
  return [
    {
      type: 'rect',
      x,
      y,
      w: boxW,
      h: boxH,
      rx: 2,
      ry: 2,
      style: { fill: '#FFFAD0', stroke: '#E0B040', strokeWidth: 1 },
    },
    {
      type: 'text',
      x: x + HANDWRITTEN_NOTICE_PAD_X,
      y: y + HANDWRITTEN_NOTICE_PAD_Y + HANDWRITTEN_NOTICE_FONT_SIZE * 0.85,
      text: HANDWRITTEN_NOTICE_TEXT,
      anchor: 'start',
      baseline: 'alphabetic',
      font: {
        family: 'monospace',
        size: HANDWRITTEN_NOTICE_FONT_SIZE,
        color: '#7a5a00',
      },
    },
  ];
}
