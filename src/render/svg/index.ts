import type { Renderer } from '../renderer.js';
import type {
  Baseline,
  CircleShape,
  EllipseShape,
  FontStyle,
  GroupShape,
  LineShape,
  PathShape,
  PolygonShape,
  PolylineShape,
  RectShape,
  Scene,
  Shape,
  Style,
  TextAnchor,
  TextShape,
} from '../../scene/types.js';
import { svgEl } from './dom.js';

export interface SvgRendererOptions {
  document?: Document;
}

export class SvgRenderer implements Renderer<SVGSVGElement> {
  private readonly doc: Document;

  constructor(opts: SvgRendererOptions = {}) {
    const doc = opts.document ?? (typeof document !== 'undefined' ? document : undefined);
    if (!doc) {
      throw new Error('SvgRenderer requires a Document (none found in environment)');
    }
    this.doc = doc;
  }

  render(scene: Scene): SVGSVGElement {
    const root = svgEl(this.doc, 'svg', {
      width: scene.width,
      height: scene.height,
      viewBox: `0 0 ${scene.width} ${scene.height}`,
    });

    if (scene.background) {
      root.appendChild(
        svgEl(this.doc, 'rect', {
          x: 0,
          y: 0,
          width: scene.width,
          height: scene.height,
          fill: scene.background,
        }),
      );
    }

    for (const shape of scene.children) {
      root.appendChild(this.renderShape(shape));
    }

    return root;
  }

  private renderShape(shape: Shape): SVGElement {
    switch (shape.type) {
      case 'rect': return this.renderRect(shape);
      case 'circle': return this.renderCircle(shape);
      case 'ellipse': return this.renderEllipse(shape);
      case 'line': return this.renderLine(shape);
      case 'polyline': return this.renderPolyline(shape);
      case 'polygon': return this.renderPolygon(shape);
      case 'path': return this.renderPath(shape);
      case 'text': return this.renderText(shape);
      case 'group': return this.renderGroup(shape);
    }
  }

  private renderRect(s: RectShape): SVGElement {
    return svgEl(this.doc, 'rect', {
      x: s.x, y: s.y, width: s.w, height: s.h,
      rx: s.rx, ry: s.ry,
      ...styleAttrs(s.style),
    });
  }

  private renderCircle(s: CircleShape): SVGElement {
    return svgEl(this.doc, 'circle', {
      cx: s.cx, cy: s.cy, r: s.r,
      ...styleAttrs(s.style),
    });
  }

  private renderEllipse(s: EllipseShape): SVGElement {
    return svgEl(this.doc, 'ellipse', {
      cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry,
      ...styleAttrs(s.style),
    });
  }

  private renderLine(s: LineShape): SVGElement {
    return svgEl(this.doc, 'line', {
      x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
      ...styleAttrs(s.style, { defaultFill: 'none', defaultStroke: '#000' }),
    });
  }

  private renderPolyline(s: PolylineShape): SVGElement {
    return svgEl(this.doc, 'polyline', {
      points: s.points.map(([x, y]) => `${x},${y}`).join(' '),
      ...styleAttrs(s.style, { defaultFill: 'none', defaultStroke: '#000' }),
    });
  }

  private renderPolygon(s: PolygonShape): SVGElement {
    return svgEl(this.doc, 'polygon', {
      points: s.points.map(([x, y]) => `${x},${y}`).join(' '),
      ...styleAttrs(s.style),
    });
  }

  private renderPath(s: PathShape): SVGElement {
    return svgEl(this.doc, 'path', {
      d: s.d,
      ...styleAttrs(s.style, { defaultFill: 'none', defaultStroke: '#000' }),
    });
  }

  private renderText(s: TextShape): SVGElement {
    const el = svgEl(this.doc, 'text', {
      x: s.x, y: s.y,
      'text-anchor': anchorAttr(s.anchor),
      'dominant-baseline': baselineAttr(s.baseline),
      ...fontAttrs(s.font),
    });
    el.textContent = s.text;
    return el;
  }

  private renderGroup(s: GroupShape): SVGElement {
    const el = svgEl(this.doc, 'g', { transform: s.transform });
    for (const child of s.children) el.appendChild(this.renderShape(child));
    return el;
  }
}

function styleAttrs(
  style: Style | undefined,
  defaults: { defaultFill?: string; defaultStroke?: string } = {},
): Record<string, string | number | undefined> {
  return {
    fill: style?.fill ?? defaults.defaultFill,
    stroke: style?.stroke ?? defaults.defaultStroke,
    'stroke-width': style?.strokeWidth,
    'stroke-dasharray': style?.strokeDasharray,
    opacity: style?.opacity,
  };
}

function fontAttrs(font: FontStyle | undefined): Record<string, string | number | undefined> {
  return {
    'font-family': font?.family,
    'font-size': font?.size,
    'font-weight': font?.weight,
    'font-style': font?.style,
    fill: font?.color,
  };
}

function anchorAttr(a: TextAnchor | undefined): string | undefined {
  return a;
}

function baselineAttr(b: Baseline | undefined): string | undefined {
  return b;
}
