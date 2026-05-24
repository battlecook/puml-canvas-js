export interface TextMetrics {
  width: number;
  height: number;
  lineCount: number;
}

const AVG_CHAR_W_RATIO = 0.6;
const LINE_HEIGHT_RATIO = 1.25;

export function measureText(text: string, fontSize: number): TextMetrics {
  const lines = text.split('\n');
  let maxLen = 0;
  for (const ln of lines) {
    if (ln.length > maxLen) maxLen = ln.length;
  }
  return {
    width: maxLen * fontSize * AVG_CHAR_W_RATIO,
    height: lines.length * fontSize * LINE_HEIGHT_RATIO,
    lineCount: lines.length,
  };
}
