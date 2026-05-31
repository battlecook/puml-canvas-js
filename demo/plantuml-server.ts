// Builds a URL to the official PlantUML server (https://plantuml.com) that renders
// the *original* output for a given PlantUML source. Used in the demo to place the
// reference rendering next to puml-canvas-js's own rendering for visual comparison.
//
// The PlantUML server expects the source to be raw-DEFLATE compressed and then encoded
// with PlantUML's custom base64 variant (alphabet 0-9 A-Z a-z - _). See
// https://plantuml.com/text-encoding.

const PLANTUML_BASE = 'https://www.plantuml.com/plantuml';

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode64(data: Uint8Array): string {
  let r = '';
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      r += append3bytes(data[i], data[i + 1], 0);
    } else if (i + 1 === data.length) {
      r += append3bytes(data[i], 0, 0);
    } else {
      r += append3bytes(data[i], data[i + 1], data[i + 2]);
    }
  }
  return r;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(bytes as BufferSource);
  void writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Encode a PlantUML source string to the server's deflate+base64 path segment. */
export async function encodePlantuml(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const deflated = await deflateRaw(bytes);
  return encode64(deflated);
}

/** URL to the official PlantUML server rendering (SVG) of the given source. */
export async function plantumlServerSvgUrl(source: string): Promise<string> {
  const encoded = await encodePlantuml(source);
  return `${PLANTUML_BASE}/svg/${encoded}`;
}
