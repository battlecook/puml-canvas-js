// State-diagram fidelity harness.
//
// For every sample in demo/state-samples.ts (SAMPLES_STATE_LIST) this tool:
//   1. fetches the OFFICIAL PlantUML server SVG (deflate-raw + PlantUML base64),
//      caching each result on disk so reruns are offline,
//   2. renders OUR SVG via the project's `render()` under jsdom,
//   3. parses both SVGs into a normalized structural model,
//   4. computes a per-sample structural diff + divergence flags,
//   5. writes tools/state-fidelity-report.md.
//
// Run: `npm run compare:state`  (== `node tools/compare-state.mjs`)
//
// Notes:
// - The OFFICIAL SVG is heavily annotated (class="entity|start_entity|end_entity",
//   data-qualified-name, class="link" data-entity-1/2), so node + edge identity is
//   reliable on that side. OUR SVG is plain geometry (rect/circle/polygon/line/path/
//   text with no semantic markers), so OUR model is inferred purely from geometry —
//   see the heuristics documented inline in parseOurSvg().
// - Overlap-based flags (LABEL_INSIDE_NODE, LABEL_OVERLAP, EDGE_THROUGH_NODE,
//   PARALLEL_EDGES_COINCIDENT) are computed on OUR output alone; they are objective
//   and don't need the official SVG.

import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(__dirname, '.puml-cache');
const REPORT_PATH = join(__dirname, 'state-fidelity-report.md');
const PLANTUML_BASE = 'https://www.plantuml.com/plantuml';
const FETCH_DELAY_MS = 400; // politeness delay between network calls (cache misses only)

// ---------------------------------------------------------------------------
// PlantUML encoder (replicated from demo/plantuml-server.ts)
// ---------------------------------------------------------------------------

function encode6bit(b) {
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

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode64(data) {
  let r = '';
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) r += append3bytes(data[i], data[i + 1], 0);
    else if (i + 1 === data.length) r += append3bytes(data[i], 0, 0);
    else r += append3bytes(data[i], data[i + 1], data[i + 2]);
  }
  return r;
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const chunks = [];
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

async function encodePlantuml(source) {
  const bytes = new TextEncoder().encode(source);
  const deflated = await deflateRaw(bytes);
  return encode64(deflated);
}

// ---------------------------------------------------------------------------
// Caching fetch of official SVG
// ---------------------------------------------------------------------------

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function sourceHash(source) {
  return createHash('sha256').update(source).digest('hex').slice(0, 12);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOfficialSvg(title, source) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = `${slugify(title)}.${sourceHash(source)}.svg`;
  const cachePath = join(CACHE_DIR, key);
  if (existsSync(cachePath)) {
    return { svg: readFileSync(cachePath, 'utf8'), fromCache: true };
  }
  const enc = await encodePlantuml(source);
  const url = `${PLANTUML_BASE}/svg/${enc}`;
  await sleep(FETCH_DELAY_MS);
  const res = await fetch(url);
  const svg = await res.text();
  // Cache the body regardless of HTTP status so reruns stay offline. The PlantUML
  // server returns HTTP 400 + an "error" SVG (no data-diagram-type) for sources it
  // cannot render; we still cache that so we don't keep re-hitting the server.
  writeFileSync(cachePath, svg, 'utf8');
  if (res.status !== 200) {
    return { svg, fromCache: false, httpStatus: res.status };
  }
  return { svg, fromCache: false };
}

// The official renderer emits `data-diagram-type="STATE"` for a successful state
// diagram. Its HTTP-400 error page is an SVG WITHOUT that marker (it shows an error
// message). Use that to decide whether an official model is trustworthy.
function isOfficialStateSvg(svgText) {
  return /data-diagram-type="STATE"/.test(svgText);
}

// ---------------------------------------------------------------------------
// Our renderer (jsdom-backed). Mirrors tests/ which run under the jsdom vitest
// environment; here we construct a JSDOM window and expose document/window
// globally before importing the built bundle.
// ---------------------------------------------------------------------------

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const serializer = new dom.window.XMLSerializer();

const { render } = await import(join(ROOT, 'dist', 'puml-canvas-js.js'));

function renderOurSvg(source) {
  const svgEl = render(source);
  return serializer.serializeToString(svgEl);
}

// ---------------------------------------------------------------------------
// SVG parsing helpers
// ---------------------------------------------------------------------------

function parseDoc(svgText) {
  // jsdom's HTML parser lowercases SVG attrs/preserves namespaces poorly for our
  // needs; use the XML document mode to keep attribute casing + structure.
  const d = new JSDOM(svgText, { contentType: 'image/svg+xml' });
  return d.window.document;
}

function num(v) {
  if (v == null) return NaN;
  const m = String(v).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

function canvasSize(doc) {
  const svg = doc.querySelector('svg');
  if (!svg) return { w: NaN, h: NaN };
  let w = num(svg.getAttribute('width'));
  let h = num(svg.getAttribute('height'));
  if (Number.isNaN(w) || Number.isNaN(h)) {
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const p = vb.split(/[ ,]+/).map(Number);
      if (p.length === 4) {
        w = p[2];
        h = p[3];
      }
    }
  }
  return { w, h };
}

// Bounding-box helpers
const bboxOf = (x, y, w, h) => ({ x, y, w, h, x2: x + w, y2: y + h });
function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x2 && a.x2 + pad > b.x && a.y - pad < b.y2 && a.y2 + pad > b.y;
}
function overlapArea(a, b) {
  const ox = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y, b.y));
  return ox * oy;
}
function centerInside(pt, box, pad = 0) {
  return pt.x >= box.x - pad && pt.x <= box.x2 + pad && pt.y >= box.y - pad && pt.y <= box.y2 + pad;
}

// Estimate a rendered text box from its character count and font size, anchored
// per the <text> x/y and text-anchor. This replaces the old point-sized label
// model (which badly under-detected overlap: a 110px-wide label was treated as
// a 60px stub centred on the anchor). Width ≈ chars × fontSize × 0.55,
// height ≈ fontSize × 1.2 (matches the renderer's measureText proportions).
const CHAR_W_RATIO = 0.55;
const LINE_H_RATIO = 1.2;
function textBox(t) {
  const fontSize = Number.isFinite(t.fontSize) ? t.fontSize : 11;
  const lines = (t.text || '').split('\n');
  let maxLen = 0;
  for (const ln of lines) if (ln.length > maxLen) maxLen = ln.length;
  const w = Math.max(1, maxLen * fontSize * CHAR_W_RATIO);
  const h = Math.max(fontSize, lines.length * fontSize * LINE_H_RATIO);
  // Vertically the <text> baseline=middle, so y is the box centre. Horizontally
  // the anchor determines the box's x origin.
  const anchor = t.anchor || 'middle';
  let x;
  if (anchor === 'start') x = t.x;
  else if (anchor === 'end') x = t.x - w;
  else x = t.x - w / 2; // middle (default)
  return bboxOf(x, t.y - h / 2, w, h);
}

// Sample N points along an SVG path's d attribute by pulling out all coordinate
// pairs (M/L/C/etc.). Approximate — treats the control-point list as a polyline,
// which is good enough to test "does this stroke pass through a node box".
function pathPoints(d) {
  const nums = (d.match(/-?[\d.]+/g) || []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}
function polylinePoints(s) {
  const nums = (s.match(/-?[\d.]+/g) || []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

// Insert intermediate samples along each segment so the spacing between successive
// points is at most `step`. Used to catch straight strokes that cross a box mid-span.
function densify(pts, step = 6) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse OFFICIAL PlantUML SVG -> structural model
//
// Heuristics (official side is well-annotated, so these are reliable):
//   - nodes: <g class="entity"> containing a <rect> OR a <path> (composite states
//     render as a rounded-top <path> instead of a <rect>). data-qualified-name
//     gives identity; a dot in the qualified name (e.g. "NotShooting.Idle") => nested.
//   - special pseudo-states: class="start_entity" / "end_entity" (ellipse(s)).
//   - edges: <g class="link"> with a <path> + arrowhead <polygon>, optional <text>.
// ---------------------------------------------------------------------------

function parseOfficialSvg(svgText) {
  const doc = parseDoc(svgText);
  const { w, h } = canvasSize(doc);
  const nodes = [];
  const specials = [];
  let nested = false;

  for (const g of doc.querySelectorAll('g.entity, g[class="entity"]')) {
    const qn = g.getAttribute('data-qualified-name') || '';
    if (qn.includes('.')) nested = true;
    // geometry: prefer rect; else bbox of path
    let box = null;
    const rect = g.querySelector('rect');
    if (rect) {
      box = bboxOf(num(rect.getAttribute('x')), num(rect.getAttribute('y')), num(rect.getAttribute('width')), num(rect.getAttribute('height')));
    } else {
      const path = g.querySelector('path');
      if (path) {
        const pts = pathPoints(path.getAttribute('d') || '');
        if (pts.length) {
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          box = bboxOf(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        }
      }
    }
    // label: first <text> in the entity group (the title row)
    const text = g.querySelector('text');
    const label = (text?.textContent || qn.split('.').pop() || '').trim();
    nodes.push({ label, qualified: qn, box, kind: 'state' });
  }

  for (const g of doc.querySelectorAll('g.start_entity, g.end_entity, g[class="start_entity"], g[class="end_entity"]')) {
    const cls = g.getAttribute('class') || '';
    specials.push({ kind: cls.includes('end') ? 'final' : 'initial' });
  }

  const edges = [];
  for (const g of doc.querySelectorAll('g.link, g[class~="link"]')) {
    const path = g.querySelector('path');
    const text = g.querySelector('text');
    edges.push({
      e1: g.getAttribute('data-entity-1') || '',
      e2: g.getAttribute('data-entity-2') || '',
      id: path?.getAttribute('id') || '',
      label: (text?.textContent || '').trim(),
    });
  }

  return { w, h, nodes, specials, edges, nested };
}

// ---------------------------------------------------------------------------
// Parse OUR SVG -> structural model
//
// Our renderer emits plain geometry with no identity markers. Heuristics:
//   - NODE BOX: <rect> with both rx and ry > 0 (rounded) AND a non-#fff fill
//     (state boxes are #fefece). The background rect is the full-canvas #fff rect
//     (skipped). The immediately-following centered <text> (text-anchor=middle)
//     whose center lies inside the rect is the node label.
//   - COMPOSITE detection: a node box that geometrically contains another node box
//     => the container is nested (used for NESTING_MISMATCH).
//   - INITIAL state: filled <circle> (fill #222) r ~ 8.
//   - FINAL state: a <circle> concentric with another circle (ring) — approximated
//     as any non-filled circle paired with a filled inner one at same center.
//   - CHOICE: <polygon> with exactly 4 points (diamond).
//   - FORK/JOIN: thin filled <rect> (fill #222, height <= ~10, no rx).
//   - EDGES: <line> or <path> strokes; each is typically followed by an arrowhead
//     <polyline>/<polygon>. We treat <line> and <path> (non-node) as edge strokes.
//   - EDGE LABELS: <text> whose center is NOT inside any node box.
// ---------------------------------------------------------------------------

const NODE_FILL = new Set(['#fefece', '#f1f1f1', '#feffff']);
const FILLED_DARK = new Set(['#222', '#222222', '#181818', '#000', '#000000']);

function parseOurSvg(svgText) {
  const doc = parseDoc(svgText);
  const { w, h } = canvasSize(doc);
  const svg = doc.querySelector('svg');
  const children = svg ? [...svg.children] : [];

  const nodeBoxes = [];
  const edgeStrokes = [];
  const texts = [];
  const specials = [];
  let choiceCount = 0;
  let forkJoinCount = 0;

  const flatten = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'g') {
      for (const c of [...el.children]) flatten(c);
      return;
    }
    if (tag === 'rect') {
      const x = num(el.getAttribute('x'));
      const y = num(el.getAttribute('y'));
      const rw = num(el.getAttribute('width'));
      const rh = num(el.getAttribute('height'));
      const fill = (el.getAttribute('fill') || '').toLowerCase();
      const rx = num(el.getAttribute('rx'));
      // full-canvas background rect -> skip
      if (rw >= w - 1 && rh >= h - 1) return;
      if (FILLED_DARK.has(fill) && rh <= 12 && !(rx > 0)) {
        forkJoinCount++;
        return;
      }
      // rounded, light fill => state node box
      if (rx > 0 || NODE_FILL.has(fill)) {
        nodeBoxes.push({ box: bboxOf(x, y, rw, rh), label: null });
      }
      return;
    }
    if (tag === 'circle') {
      const cx = num(el.getAttribute('cx'));
      const cy = num(el.getAttribute('cy'));
      const r = num(el.getAttribute('r'));
      const fill = (el.getAttribute('fill') || '').toLowerCase();
      specials.push({ kind: 'circle', cx, cy, r, filled: FILLED_DARK.has(fill) });
      return;
    }
    if (tag === 'ellipse') {
      const cx = num(el.getAttribute('cx'));
      const cy = num(el.getAttribute('cy'));
      const fill = (el.getAttribute('fill') || '').toLowerCase();
      specials.push({ kind: 'circle', cx, cy, r: num(el.getAttribute('rx')), filled: FILLED_DARK.has(fill) });
      return;
    }
    if (tag === 'polygon') {
      const pts = polylinePoints(el.getAttribute('points') || '');
      if (pts.length === 4) choiceCount++;
      return;
    }
    if (tag === 'line') {
      const pts = [
        { x: num(el.getAttribute('x1')), y: num(el.getAttribute('y1')) },
        { x: num(el.getAttribute('x2')), y: num(el.getAttribute('y2')) },
      ];
      edgeStrokes.push({ pts });
      return;
    }
    if (tag === 'path') {
      const d = el.getAttribute('d') || '';
      const pts = pathPoints(d);
      if (pts.length >= 2) edgeStrokes.push({ pts });
      return;
    }
    if (tag === 'polyline') {
      // arrowheads — ignore as edge strokes (they are short 3-point markers)
      return;
    }
    if (tag === 'text') {
      const x = num(el.getAttribute('x'));
      const y = num(el.getAttribute('y'));
      const anchor = el.getAttribute('text-anchor') || '';
      const fs = num(el.getAttribute('font-size'));
      texts.push({
        x,
        y,
        anchor,
        fontSize: Number.isFinite(fs) ? fs : 11,
        text: (el.textContent || '').trim(),
      });
      return;
    }
  };
  for (const c of children) flatten(c);

  // Classify each <text> as either NODE-INTERNAL (a state's title or one of its
  // description rows) or an EDGE label. A node-internal text's real rendered box
  // is (almost) fully contained inside a LEAF node box — titles and descriptions
  // are laid out within their node's rect. We test only LEAF boxes (a box that
  // does NOT strictly enclose another node box): a composite FRAME contains all
  // of its children's edge labels too, so testing frames would wrongly treat
  // every transition label as node-internal. An edge label that drifts on top of
  // a leaf is still NOT fully contained — it pokes outside the narrow leaf rect
  // (it was placed against the edge, not sized to fit the node) — so it stays an
  // edge label and LABEL_INSIDE_NODE can flag the intrusion.
  const isContainer = (n) =>
    nodeBoxes.some(
      (o) =>
        o !== n &&
        o.box.x > n.box.x &&
        o.box.y > n.box.y &&
        o.box.x2 < n.box.x2 &&
        o.box.y2 < n.box.y2,
    );
  const leafBoxes = nodeBoxes.filter((n) => !isContainer(n));
  const containerBoxes = nodeBoxes.filter((n) => isContainer(n));
  // Header strip height of a composite frame (its title row). Texts landing in
  // this band at the top of a container are that composite's name, not edge
  // labels — claim them so they don't pollute the edge-label set.
  const HEADER_BAND = 26;
  const edgeLabels = [];
  for (const t of texts) {
    const lb = textBox(t);
    const lbArea = lb.w * lb.h || 1;
    // The LEAF box that contains the greatest fraction of this text's box.
    let bestFrac = 0;
    let bestNode = null;
    for (const n of leafBoxes) {
      const frac = overlapArea(lb, n.box) / lbArea;
      if (frac > bestFrac) {
        bestFrac = frac;
        bestNode = n;
      }
    }
    // ≥ 85% contained in a leaf ⇒ node-internal (title/description). Assign the
    // first unclaimed such text as the node's title label.
    if (bestFrac >= 0.85 && bestNode) {
      if (bestNode.label == null) bestNode.label = t.text;
      continue;
    }
    // Composite-frame header: text centred in the top header band of a
    // container box. Claim it as that container's name.
    const header = containerBoxes.find(
      (n) =>
        t.x >= n.box.x &&
        t.x <= n.box.x2 &&
        t.y >= n.box.y &&
        t.y <= n.box.y + HEADER_BAND,
    );
    if (header) {
      if (header.label == null) header.label = t.text;
      continue;
    }
    edgeLabels.push(t);
  }

  // Filled circle => initial; ring (filled inner + unfilled outer at same center) => final.
  for (const c of specials) {
    if (c.kind !== 'circle') continue;
    const concentric = specials.find(
      (o) => o !== c && o.kind === 'circle' && Math.abs(o.cx - c.cx) < 2 && Math.abs(o.cy - c.cy) < 2,
    );
    if (concentric) c.special = 'final';
    else if (c.filled) c.special = 'initial';
  }

  // composite detection: node box strictly containing another node box
  let nested = false;
  for (const a of nodeBoxes) {
    for (const b of nodeBoxes) {
      if (a === b) continue;
      if (a.box.x < b.box.x && a.box.y < b.box.y && a.box.x2 > b.box.x2 && a.box.y2 > b.box.y2) {
        nested = true;
        a.composite = true;
      }
    }
  }

  return { w, h, nodeBoxes, leafBoxes, edgeStrokes, edgeLabels, specials, choiceCount, forkJoinCount, nested };
}

// ---------------------------------------------------------------------------
// Divergence flag computation
// ---------------------------------------------------------------------------

function computeFlags(ours, official) {
  const flags = [];
  const detail = {};

  // ----- OUR-only objective overlap flags -----

  // Compute each edge label's REAL rendered box (chars × fontSize × 0.55), not
  // a fixed point-stub. A wide label like "EvNewValueRejected" (~118px) now
  // properly overlaps neighbours/nodes it visually collides with.
  const lboxes = ours.edgeLabels.map((t) => textBox(t));

  // LABEL_INSIDE_NODE: an edge-label box overlaps a LEAF node box by more than a
  // small margin (a few px of area is tolerated for grazing). Composite FRAMES
  // legitimately contain their children's edge labels, so only leaf boxes are
  // obstacles here.
  const INSIDE_MIN_AREA = 12; // px² — anything beyond a slight clip counts
  const insideBoxes = ours.leafBoxes ?? ours.nodeBoxes;
  let labelInside = 0;
  for (const lb of lboxes) {
    for (const n of insideBoxes) {
      if (overlapArea(lb, n.box) > INSIDE_MIN_AREA) {
        labelInside++;
        break;
      }
    }
  }
  if (labelInside > 0) {
    flags.push('LABEL_INSIDE_NODE');
    detail.LABEL_INSIDE_NODE = labelInside;
  }

  // LABEL_OVERLAP: two edge-label boxes overlap by more than a few px on both
  // axes (a tiny corner-clip is tolerated).
  const OVERLAP_MIN = 3; // px overlap on each axis
  let labelOverlap = 0;
  for (let i = 0; i < lboxes.length; i++) {
    for (let j = i + 1; j < lboxes.length; j++) {
      const a = lboxes[i];
      const b = lboxes[j];
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x, b.x);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
      if (ox > OVERLAP_MIN && oy > OVERLAP_MIN) labelOverlap++;
    }
  }
  if (labelOverlap > 0) {
    flags.push('LABEL_OVERLAP');
    detail.LABEL_OVERLAP = labelOverlap;
  }

  // EDGE_THROUGH_NODE: an edge stroke passes through a node box that is not one of
  // its endpoints. Endpoint = a node box whose bbox contains the stroke's first or
  // last sampled point (with a small pad).
  let edgeThrough = 0;
  for (const e of ours.edgeStrokes) {
    if (e.pts.length < 2) continue;
    const first = e.pts[0];
    const last = e.pts[e.pts.length - 1];
    // Densify the polyline so a long straight segment that visually crosses a box
    // mid-span is sampled (a 2-point <line> otherwise has no interior samples).
    const dense = densify(e.pts, 6);
    // interior = densified samples excluding the true endpoints' immediate region
    const interior = dense.slice(1, -1);
    if (!interior.length) continue;
    for (const n of ours.nodeBoxes) {
      const isEndpoint = centerInside(first, n.box, 6) || centerInside(last, n.box, 6);
      if (isEndpoint) continue;
      // count an interior sample strictly inside the box (with negative pad so a
      // mere grazing of the border doesn't trigger)
      const through = interior.some((p) => centerInside(p, n.box, -4));
      if (through) {
        edgeThrough++;
        break;
      }
    }
  }
  if (edgeThrough > 0) {
    flags.push('EDGE_THROUGH_NODE');
    detail.EDGE_THROUGH_NODE = edgeThrough;
  }

  // PARALLEL_EDGES_COINCIDENT: two edge strokes share nearly identical geometry
  // (same endpoints within tolerance) — i.e. two transitions between the same pair
  // drawn on top of each other instead of being separated.
  let coincident = 0;
  const endpts = ours.edgeStrokes
    .filter((e) => e.pts.length >= 2)
    .map((e) => ({ a: e.pts[0], b: e.pts[e.pts.length - 1] }));
  const near = (p, q, tol) => Math.abs(p.x - q.x) < tol && Math.abs(p.y - q.y) < tol;
  const TOL = 6;
  for (let i = 0; i < endpts.length; i++) {
    for (let j = i + 1; j < endpts.length; j++) {
      const A = endpts[i];
      const B = endpts[j];
      const sameDir = near(A.a, B.a, TOL) && near(A.b, B.b, TOL);
      const revDir = near(A.a, B.b, TOL) && near(A.b, B.a, TOL);
      if (sameDir || revDir) coincident++;
    }
  }
  if (coincident > 0) {
    flags.push('PARALLEL_EDGES_COINCIDENT');
    detail.PARALLEL_EDGES_COINCIDENT = coincident;
  }

  // ----- Cross-reference flags (need official) -----
  if (official) {
    const ourNodeCount = ours.nodeBoxes.length;
    const offNodeCount = official.nodes.length;
    if (ourNodeCount !== offNodeCount) {
      flags.push('NODE_COUNT_MISMATCH');
      detail.NODE_COUNT_MISMATCH = `ours=${ourNodeCount} official=${offNodeCount}`;
    }

    // MISSING_NODE: an official node label has no match among our node labels.
    const ourLabels = new Set(
      ours.nodeBoxes.map((n) => (n.label || '').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean),
    );
    const missing = [];
    for (const n of official.nodes) {
      const lab = (n.label || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!lab) continue;
      // match if any our-label contains or equals the official label's first token
      const key = lab.split(' ')[0];
      const found = [...ourLabels].some((ol) => ol === lab || ol.includes(key) || key.includes(ol));
      if (!found) missing.push(n.label);
    }
    if (missing.length) {
      flags.push('MISSING_NODE');
      detail.MISSING_NODE = missing;
    }

    // EDGE_COUNT_MISMATCH (informational): our edge-stroke count vs official links.
    const ourEdges = ours.edgeStrokes.length;
    const offEdges = official.edges.length;
    if (offEdges > 0 && Math.abs(ourEdges - offEdges) > Math.max(1, offEdges * 0.5)) {
      flags.push('EDGE_COUNT_MISMATCH');
      detail.EDGE_COUNT_MISMATCH = `ours=${ourEdges} official=${offEdges}`;
    }

    // CANVAS_RATIO_OFF: aspect ratio differs by >50%.
    const ourAR = ours.w / ours.h;
    const offAR = official.w / official.h;
    if (isFinite(ourAR) && isFinite(offAR) && offAR > 0) {
      const ratio = ourAR / offAR;
      if (ratio > 1.5 || ratio < 1 / 1.5) {
        flags.push('CANVAS_RATIO_OFF');
        detail.CANVAS_RATIO_OFF = `ours AR=${ourAR.toFixed(2)} official AR=${offAR.toFixed(2)}`;
      }
    }

    // NESTING_MISMATCH: official has nested (dotted qualified names) but ours shows
    // no containment, or vice versa.
    if (official.nested !== ours.nested) {
      flags.push('NESTING_MISMATCH');
      detail.NESTING_MISMATCH = `ours.nested=${ours.nested} official.nested=${official.nested}`;
    }
  }

  return { flags, detail };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SEVERITY = {
  RENDER_ERROR: 5,
  EDGE_THROUGH_NODE: 4,
  LABEL_INSIDE_NODE: 4,
  PARALLEL_EDGES_COINCIDENT: 4,
  NESTING_MISMATCH: 3,
  LABEL_OVERLAP: 3,
  MISSING_NODE: 3,
  NODE_COUNT_MISMATCH: 2,
  EDGE_COUNT_MISMATCH: 2,
  CANVAS_RATIO_OFF: 1,
};

const BUCKETS = [
  {
    name: 'composite/nested edge+label rendering',
    flags: ['NESTING_MISMATCH', 'LABEL_INSIDE_NODE'],
  },
  { name: 'parallel/bidirectional separation', flags: ['PARALLEL_EDGES_COINCIDENT'] },
  { name: 'edge routing through nodes', flags: ['EDGE_THROUGH_NODE'] },
  { name: 'label overlap / placement', flags: ['LABEL_OVERLAP'] },
  { name: 'missing/extra nodes', flags: ['MISSING_NODE', 'NODE_COUNT_MISMATCH'] },
  { name: 'edge count / special-node geometry', flags: ['EDGE_COUNT_MISMATCH'] },
  { name: 'canvas sizing', flags: ['CANVAS_RATIO_OFF'] },
  { name: 'render failures', flags: ['RENDER_ERROR'] },
];

async function main() {
  const { SAMPLES_STATE_LIST } = await import(join(ROOT, 'demo', 'state-samples.ts'));
  const results = [];
  let cacheHits = 0;
  let fetches = 0;

  for (let i = 0; i < SAMPLES_STATE_LIST.length; i++) {
    const { title, source } = SAMPLES_STATE_LIST[i];
    const entry = { idx: i + 1, title, flags: [], detail: {}, ours: null, official: null, error: null };

    // official (cached)
    let official = null;
    try {
      const { svg, fromCache, httpStatus } = await fetchOfficialSvg(title, source);
      if (fromCache) cacheHits++;
      else fetches++;
      if (!isOfficialStateSvg(svg)) {
        // Server returned a non-state / error SVG (e.g. HTTP 400 for an unsupported
        // construct). Don't trust it for node/edge counts — record why and skip
        // cross-reference flags for this sample.
        entry.officialError = `server returned non-STATE svg${httpStatus ? ` (HTTP ${httpStatus})` : ''}`;
      } else {
        official = parseOfficialSvg(svg);
        entry.official = { w: official.w, h: official.h, nodes: official.nodes.length, edges: official.edges.length };
      }
    } catch (err) {
      entry.officialError = String(err.message || err);
    }

    // ours
    try {
      const svgText = renderOurSvg(source);
      const ours = parseOurSvg(svgText);
      entry.ours = {
        w: ours.w,
        h: ours.h,
        nodes: ours.nodeBoxes.length,
        edges: ours.edgeStrokes.length,
        labels: ours.edgeLabels.length,
      };
      const { flags, detail } = computeFlags(ours, official);
      entry.flags = flags;
      entry.detail = detail;
    } catch (err) {
      entry.flags = ['RENDER_ERROR'];
      entry.detail = { RENDER_ERROR: String(err.stack || err.message || err).split('\n').slice(0, 3).join(' | ') };
      entry.error = String(err.message || err);
    }

    results.push(entry);
    process.stdout.write(
      `[${String(i + 1).padStart(2)}/45] ${title.slice(0, 40).padEnd(40)} flags: ${entry.flags.join(', ') || '(none)'}\n`,
    );
  }

  writeReport(results, { cacheHits, fetches });
  console.log(`\nDone. ${cacheHits} cache hit(s), ${fetches} network fetch(es).`);
  console.log(`Report: ${REPORT_PATH}`);
}

function writeReport(results, stats) {
  const lines = [];
  lines.push('# State Diagram Fidelity Report');
  lines.push('');
  lines.push(`Generated by \`tools/compare-state.mjs\` (\`npm run compare:state\`).`);
  lines.push('');
  lines.push(
    'Compares our renderer\'s SVG against the official PlantUML server SVG for each ' +
      'sample in `SAMPLES_STATE_LIST` (`demo/state-samples.ts`). Overlap flags ' +
      '(`LABEL_INSIDE_NODE`, `LABEL_OVERLAP`, `EDGE_THROUGH_NODE`, `PARALLEL_EDGES_COINCIDENT`) ' +
      'are measured on our output alone; the rest cross-reference the official SVG.',
  );
  lines.push('');
  lines.push(`Official SVGs: ${stats.cacheHits} from disk cache, ${stats.fetches} fetched this run.`);
  lines.push('');

  // ---- Per-sample section ----
  lines.push('## Per-sample results');
  lines.push('');
  lines.push('| # | Title | Our canvas | Official canvas | Nodes (ours/off) | Flags |');
  lines.push('|---|-------|-----------|-----------------|------------------|-------|');
  for (const r of results) {
    const oc = r.ours ? `${fmt(r.ours.w)}×${fmt(r.ours.h)}` : '—';
    const fc = r.official ? `${fmt(r.official.w)}×${fmt(r.official.h)}` : r.officialError ? 'n/a' : '—';
    const nc = `${r.ours ? r.ours.nodes : '—'}/${r.official ? r.official.nodes : '—'}`;
    const fl = r.flags.length ? r.flags.join(', ') : '(none)';
    lines.push(`| ${r.idx} | ${escapePipe(r.title)} | ${oc} | ${fc} | ${nc} | ${fl} |`);
  }
  lines.push('');

  // Samples where the official reference could not be obtained (cross-reference
  // flags were skipped for these; only our-side overlap flags are meaningful).
  const unavailable = results.filter((r) => r.officialError);
  if (unavailable.length) {
    lines.push(
      `> Official reference unavailable for ${unavailable.length} sample(s) — ` +
        'cross-reference flags (node/edge counts, missing nodes, canvas ratio, nesting) ' +
        'were skipped for these; only our-side overlap flags apply:',
    );
    lines.push('>');
    for (const r of unavailable) {
      lines.push(`> - #${r.idx} ${escapePipe(r.title)} — ${r.officialError}`);
    }
    lines.push('');
  }

  // detail blocks for samples with flags
  lines.push('### Flag details');
  lines.push('');
  for (const r of results) {
    if (!r.flags.length) continue;
    lines.push(`- **${r.idx}. ${escapePipe(r.title)}**`);
    for (const f of r.flags) {
      const d = r.detail[f];
      lines.push(`  - \`${f}\`${d != null ? `: ${JSON.stringify(d)}` : ''}`);
    }
  }
  lines.push('');

  // ---- Aggregate section ----
  const counts = new Map();
  for (const r of results) {
    for (const f of r.flags) {
      if (!counts.has(f)) counts.set(f, []);
      counts.get(f).push(r.idx);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);

  lines.push('## Aggregate: divergence flags');
  lines.push('');
  lines.push('| Flag | Count | Severity | Sample #s |');
  lines.push('|------|-------|----------|-----------|');
  for (const [flag, idxs] of sorted) {
    lines.push(`| \`${flag}\` | ${idxs.length} | ${SEVERITY[flag] ?? '?'} | ${idxs.join(', ')} |`);
  }
  lines.push('');

  // ---- Bucket prioritization ----
  lines.push('## Fix-bucket prioritization');
  lines.push('');
  lines.push('Buckets ranked by `Σ(count × severity)` across their member flags.');
  lines.push('');
  const bucketScores = [];
  for (const b of BUCKETS) {
    let score = 0;
    let total = 0;
    const memberCounts = [];
    const samples = new Set();
    for (const f of b.flags) {
      const idxs = counts.get(f) || [];
      const c = idxs.length;
      total += c;
      score += c * (SEVERITY[f] ?? 1);
      idxs.forEach((i) => samples.add(i));
      if (c) memberCounts.push(`${f}=${c}`);
    }
    bucketScores.push({ name: b.name, score, total, memberCounts, samples: [...samples].sort((a, b) => a - b) });
  }
  bucketScores.sort((a, b) => b.score - a.score);
  lines.push('| Rank | Bucket | Score | Affected samples | Member flags |');
  lines.push('|------|--------|-------|------------------|--------------|');
  bucketScores.forEach((b, i) => {
    lines.push(
      `| ${i + 1} | ${b.name} | ${b.score} | ${b.samples.length ? b.samples.join(', ') : '—'} | ${b.memberCounts.join(', ') || '—'} |`,
    );
  });
  lines.push('');
  lines.push('### Recommended fix order');
  lines.push('');
  bucketScores
    .filter((b) => b.score > 0)
    .forEach((b, i) => lines.push(`${i + 1}. **${b.name}** (score ${b.score}, ${b.samples.length} samples)`));
  lines.push('');

  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

const fmt = (n) => (Number.isFinite(n) ? Math.round(n) : '—');
const escapePipe = (s) => s.replace(/\|/g, '\\|');

await main();
