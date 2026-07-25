# puml-canvas-js

A native JavaScript / TypeScript implementation of [PlantUML](https://plantuml.com)
diagram rendering for the browser. No Java, no WASM, no server round-trip — parse
PlantUML text and render to SVG directly.

- **14 diagram types** supported (Sequence, Class, Activity, Use case, State,
  Component, Deployment, Object, Mindmap, WBS, Gantt, JSON, EBNF, Regex).
- **~95 % coverage** of the most common PlantUML syntax (by usage).
- **Zero runtime dependencies**. 38 KB gzipped.
- **MIT licensed**. Independent re-implementation — does not embed or derive
  from the upstream PlantUML project (GPL-3.0-licensed).
- Works in any DOM-capable environment (browser, jsdom).

## Install

> Not yet on npm. Until first release, clone the repo:
>
> ```bash
> git clone https://github.com/battlecook/puml-canvas-js
> cd puml-canvas-js && npm install
> ```

When published:

```bash
npm install puml-canvas-js
```

## Quick start

```ts
import { render } from 'puml-canvas-js';

const svg = render(`@startuml
Alice -> Bob: hello
Bob --> Alice: hi
@enduml`);

document.body.appendChild(svg);
```

`render(source)` returns an `SVGSVGElement`. The diagram type is auto-detected
from the `@start...` wrapper and the first significant content line.

## Dark theme

Pass `theme: 'dark'` to render a dark-mode variant. `'light'` (the default)
leaves colors exactly as before.

```ts
const svg = render(source, { theme: 'dark' });
```

Dark mode lightness-inverts every fill, stroke, and text color while preserving
hue and saturation — so cream boxes and black text flip to a dark palette, but
intentional accents (a red arrow, a blue note) keep their color. A dark page
background (`#1e1e1e`) is painted automatically when the diagram doesn't set one.

## API

```ts
import { render, compile, parse } from 'puml-canvas-js';

// 1. Full pipeline: PlantUML text → SVG element
const svg: SVGSVGElement = render(source);

// 2. Stop after layout: useful for custom rendering
const scene: Scene = compile(source);

// 3. AST only: useful for analysis or transformation
const ast: DiagramAst = parse(source);
```

The pipeline is decomposed so each stage is independently testable and
swappable:

```
source → lexer → parser → AST → layout → scene → renderer
```

## Supported diagrams

| Diagram          | Wrapper          | Notes                                                              |
| ---------------- | ---------------- | ------------------------------------------------------------------ |
| Sequence         | `@startuml`      | alt/else, autonumber, notes, activations, divider                  |
| Class            | `@startuml`      | generics, `<<stereo>>`, inheritance / composition / aggregation /… |
| Activity (new)   | `@startuml`      | if / while / repeat / fork / partition / detach / kill             |
| Use case         | `@startuml`      | `:User:` / `(Login)` shorthand, `<<include>>`                      |
| State            | `@startuml`      | composite states, `[*]`, `<<choice>>` / `<<fork>>` / `<<history>>` |
| Component        | `@startuml`      | nested containers, `[X]` shorthand                                 |
| Deployment       | `@startuml`      | node (3D), cloud, database, folder, frame, queue, storage, artifact |
| Object           | `@startuml`      | underlined name, `Name : attr = value`                             |
| Mindmap          | `@startmindmap`  | horizontal tree, per-level colours                                 |
| WBS              | `@startwbs`      | vertical tree                                                      |
| Gantt            | `@startgantt`    | closed weekdays, dependencies, milestones, colours                 |
| JSON             | `@startjson`     | graph-of-tables with `#highlight` path                             |
| EBNF             | `@startebnf`     | railroad diagram                                                   |
| Regex            | `@startregex`    | railroad diagram                                                   |

## Why a native JS port

The official `plantuml.js` is the Java implementation transpiled via TeaVM:
the bundle is several megabytes, slow to boot, and ships a JVM subset to
the browser. This project is a from-scratch implementation:

- Tens of KB instead of megabytes
- Idiomatic, debuggable TypeScript
- Tree-shakable
- No Java/JVM baggage

The trade-off: feature parity is intentionally less than 100 %. We aim for
the syntax the vast majority of real diagrams use, not every PlantUML
extension or edge case.

## Limitations

The following are recognized but not yet implemented:

- `skinparam`, `!theme`, `!include`, `!define`, macros — consumed silently
- PlantUML sprites and OpenIconic icon sets (GPL assets, cannot reuse)
- Salt (wireframe), Ditaa, Chronology, Math, DOT diagrams (placeholder)
- YAML diagram (placeholder; JSON is functional)
- C4 model extension keywords

Layout caveats: text width uses a `chars × 0.6 × fontSize` heuristic, so box
sizes are approximate. Deeply nested deployment diagrams use straight-line
edge routing — lines may cross container borders.

See [CHANGELOG.md](./CHANGELOG.md) for the full feature list and known
differences from upstream PlantUML.

## Development

```bash
npm install
npm run dev          # demo page with all 14 diagram samples
npm test             # vitest (263 tests)
npm run typecheck    # strict TS
npm run build        # library bundle to dist/

UPDATE_GOLDENS=1 npm test   # refresh golden SVG snapshots after intentional changes
```

The demo page (`/demo`) provides a side-by-side editor with sample buttons
for every diagram type.

## Architecture

```
src/
├── lexer/                line-based tokenizer (@startX wrapper detection)
├── parser/               per-diagram parsers
│   ├── sequence/
│   ├── class/
│   ├── activity/
│   ├── container/        shared by component/deployment/object
│   ├── grammar/          ebnf + regex
│   ├── ...
│   └── detect.ts         diagram type dispatcher
├── ast/                  typed AST per diagram kind
├── layout/               AST → Scene
│   ├── common/           Sugiyama edge drawing, shared types
│   ├── class/            sugiyama (cycle removal, layering, dummies, barycenter)
│   ├── container/nested  recursive container + per-container Sugiyama
│   ├── grammar/          railroad diagrams
│   └── ...
├── scene/                backend-neutral primitives (rect, ellipse, path, …)
└── render/svg/           Scene → SVGElement
```

## Contributing

Issues and pull requests welcome. Before submitting:

1. `npm test` — all tests pass
2. `npm run typecheck` — no TS errors
3. New feature → add a parser test (in `tests/parser/`) and a golden SVG
   (in `tests/golden/`)
4. Visual change → regenerate goldens with `UPDATE_GOLDENS=1 npm test`

## License

[MIT](./LICENSE).

This project is an **independent re-implementation** of PlantUML's public
syntax specification. No code, assets, fonts, or sprites are derived from
the upstream PlantUML project (GPL-3.0-licensed). PlantUML is a trademark
of Arnaud Roques; this project is not affiliated with or endorsed by
the PlantUML team.
