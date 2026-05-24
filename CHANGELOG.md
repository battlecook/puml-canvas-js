# Changelog

All notable changes to **puml-canvas-js** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The project is pre-1.0. While the public API is stable across patch releases,
> minor releases (0.X.0) may introduce breaking changes until 1.0.0.

## [Unreleased]

_Nothing yet._

## [0.1.0] - 2026-05-25

Initial public release. The package is feature-complete for the 14 most common
PlantUML diagram types (≈ 95 % usage coverage) and renders to SVG in any
DOM-capable environment (browser or jsdom).

### Added — Diagram types

- **Sequence** — participants (all 8 shapes: participant/actor/boundary/control/
  entity/database/queue/collections with alias), messages (`->`, `-->`, `<-`,
  `<--`), self-message loops, activations with nesting, notes (left/right/over,
  single + multi-line), groups (`group/alt/else/opt/loop/par/break/critical`),
  `autonumber` with prefix, `title`, `==divider==`. Auto-fit lane gaps based
  on message text widths. Group frames span only touched participants.
- **Class** — `class/interface/enum/abstract/annotation/record`, generics in
  class names (`Repository<T extends AggregateRoot<ID>, ID>`), members with
  visibility (`+/-/#/~`), `{static}` / `{abstract}` modifiers, stereotypes
  (`<<Service>>`), aliases, inline-body form (`class A { +x: int }`), notes
  (consumed) and floating notes (filtered out of relationships).
  Relationships: `<|--` / `--|>` (inheritance), `<|..` / `..|>` (realization),
  `*--` / `--*` (composition), `o--` / `--o` (aggregation), `-->` / `<--`
  (association), `..>` / `<..` (dependency), `--` / `..` (undirected) — with
  multiplicities and labels. Self-loop support.
- **Activity** (new syntax) — `start/stop/end`, `:action;`, `if/elseif/else/
  endif` with multi-branch and merge convergence, `while/endwhile`,
  `repeat/repeat while`, `fork/fork again/end fork`, `partition "X" { ... }`
  with dashed frame, `detach`, `kill`, `break`. Implicit empty `else` for
  `if/endif` without explicit `else`. Branches ending in a terminator skip
  the merge arrow.
- **Use case** — `actor`, `usecase`, shorthand `:User:` and `(Login)` in
  declarations and relationships. Stick-figure actor + ellipse use case.
- **State** — normal states (rounded box), `[*]` pseudo-states (filled
  circle = initial, ring = final), `<<choice>>` (diamond), `<<fork>>` /
  `<<join>>` (thick bar), `<<history>>` (H circle). **Composite states**
  (`state X { ... }`) with per-composite `[*]` pseudo-states and nested
  per-composite layered layout. Bidirectional edge pairs auto-offset with
  side-anchored labels.
- **Component** / **Deployment** / **Object** — shared container layout
  supporting kind-specific shapes: `node` (3D-perspective box), `cloud`
  (bumpy outline), `database` (cylinder), `folder` (tab + body), `frame`
  (corner-labelled rect), `queue` (pipe), `storage` (capsule), `artifact`
  (document with folded corner), `interface` (lollipop), `component`
  (rect with port marks), `rectangle`, `object` (underlined name +
  attributes). Bracket shorthand (`[Cart UI]`) and inline `Name : attr =
  value` for objects.
- **Mindmap** / **WBS** — depth-based tree parser (`*` count = level).
  Mindmap renders horizontally (root left, branches right) with per-level
  pastel colours and pill-shaped nodes. WBS renders vertically (root top)
  with rectangular nodes.
- **Gantt** — `Project starts YYYY-MM-DD`, `<weekday> are closed` with
  visual closed-day bands, `[name] lasts N days`, dependency via `starts
  at [X]'s end` and `then [X]`, milestone via `happens at [X]'s end`
  (diamond), named-colour palette + hex, `requires N people` annotation,
  month/day calendar header.
- **JSON** — `JSON.parse` with `#highlight "a" / "b" / "c"` path
  highlighting (green cell). Graph-of-tables layout: each object/array
  becomes a separate table, nested values shown as `•` connector with
  dashed edges to child tables. Type-coloured primitives. Unicode and
  escape sequences preserved. Parse errors rendered as a red error box.
- **EBNF** — railroad diagrams. Body parser handles terminal, non-terminal,
  sequence (`,`), alternation (`|`), repetition (`{}`), optional (`[]`),
  grouping (`()`), special (`? ... ?`). Per-rule layout with start (`○`) /
  end (`●`) dots, bumped alternation curves, loop arrows, bypass arcs.
  Falls back to yellow text box for rules whose body fails to parse.
- **Regex** — railroad diagrams. Pattern parser handles literals (adjacent
  chars merged into one box), character classes (`\s`, `\d`, `\w`, `[a-z]`),
  anchors (`^`, `$`, `\b`), groups (`(...)`, `(?:...)`), alternation,
  quantifiers (`*`, `+`, `?`, `{n,m}`). Falls back to monospace text box
  on parse failure.

### Added — Pipeline architecture

- Lexer producing position-tagged tokens (`@startX`/`@endX` wrappers, identifiers,
  strings, numbers, symbols, comments).
- Diagram type dispatcher: wrapper name + first significant content token,
  skipping `title/skinparam/hide/show/...` directives.
- Per-diagram parser producing a typed AST.
- Layout layer producing a backend-neutral Scene of primitives (rect, circle,
  ellipse, line, polyline, polygon, path, text, group).
- SVG renderer (`SvgRenderer` implements `Renderer<SVGSVGElement>`).
- Public entry points: `render(source)`, `compile(source)`, `parse(source)`.

### Added — Sugiyama layout (Class/Use case/State/Component/Deployment/Object)

- Cycle removal (DFS, back-edge reversal).
- Longest-path layer assignment.
- Dummy-node insertion for edges spanning multiple layers.
- Barycenter crossing minimisation (top-down + bottom-up sweeps).
- Per-container Sugiyama for nested containers: leaf-to-leaf edges are
  promoted to direct-child edges of the enclosing container, so children
  stack by data flow direction instead of declaration order.
- Bidirectional edge pairs detected and rendered as parallel offset lines
  with labels on opposite sides.
- Marker rendering for all relationship endpoints: open arrow, filled/hollow
  triangle, filled/hollow diamond. Lines shortened to make room for markers.

### Added — Tooling

- TypeScript 5 (strict, `exactOptionalPropertyTypes`).
- Vite 5 library build (ES module) + demo dev server.
- Vitest test suite covering 263 cases (parser unit + layout sanity + golden
  SVG snapshots + smoke tests on real-world inputs).
- Golden snapshot helper (`tests/golden/runner.ts`) with `UPDATE_GOLDENS=1`
  for intentional visual changes.
- Demo page (`/demo`) with toggle buttons for all 14 diagram samples.

### Known limitations

- `skinparam`, `!theme`, `!include`, `!define`, macro and conditional
  directives are silently consumed (no styling customisation).
- PlantUML sprites and OpenIconic icon sets are not bundled (GPL licence
  prevents reuse).
- Salt (`@startsalt`), Ditaa, Chronology, Math, DOT diagrams are detected
  but render as placeholders.
- YAML (`@startyaml`) renders as placeholder; JSON path is functional.
- C4 model extension keywords not recognised.
- Text width measurement uses a `chars × 0.6 × fontSize` heuristic (no real
  font metrics). Boxes may be slightly wider or narrower than ideal.
- For deeply nested deployment diagrams, edge routing is straight-line and
  may cross container borders.
- State composite scope resolution uses first-mention; PlantUML's smarter
  hoisting of cross-scope references is not implemented.

### Dependencies

Zero runtime dependencies. Dev dependencies: TypeScript, Vite, Vitest, jsdom.

### Bundle size

`dist/puml-canvas-js.js` ≈ 172 KB / 38 KB gzipped, plus declaration files.

### Licence

MIT. This project is an independent re-implementation of PlantUML's public
syntax specification. No code, assets, fonts, or sprites are derived from
the upstream PlantUML project (GPL-3.0-licensed). Diagram inputs follow the
syntax documented at plantuml.com.

[Unreleased]: https://github.com/battlecook/puml-canvas-js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/battlecook/puml-canvas-js/releases/tag/v0.1.0
