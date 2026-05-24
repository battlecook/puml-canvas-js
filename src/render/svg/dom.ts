const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs?: Record<string, string | number | undefined>,
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined) continue;
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

export { SVG_NS };
