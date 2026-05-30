# Changelog

All notable changes to **puml-canvas-js** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The project is pre-1.0. While the public API is stable across patch releases,
> minor releases (0.X.0) may introduce breaking changes until 1.0.0.

## [0.8.0] - 2026-05-30

### Added

- **Advanced state diagram support.** State diagrams now parse and render
  concurrent composite regions split by `--` or `||`, including separate
  region-local initial/final pseudo-states and dashed region separators.
- **State history and SDL pseudo-shapes.** Added `[H]` / `[H*]` history
  pseudo-states, fork/join/start/end stereotype rendering, multi-line
  transition labels, state description rows, and SDL-style shape stereotypes
  such as `<<sdlreceive>>`, `<<output>>`, and `<<task>>`.
- **Class member rendering parity.** Class members now render
  PlantUML-style visibility glyphs as colored icons, with hollow icons for
  fields and filled icons for methods.
- **Java-style class members.** Class diagrams now preserve Java-style
  `type name` and `type name()` member rows verbatim instead of forcing them
  through UML-style `name: type` formatting.
- **Use case rendering refinements.** Use case parsing, AST data, and layout
  gained additional styling and rendering coverage for the expanded
  compatibility surface.

### Fixed

- **Composite state parenting.** Forward-referenced states are reparented when
  later declared as explicit composite siblings, avoiding accidental nesting
  under the wrong parent.
- **State label and shape edge cases.** Escaped `\n` transition labels now
  split into real multi-line text rows, pseudo-state labels no longer leak as
  normal state names, and history nodes render inside their owning composite.

### Tests

- Test suite grew from 787 -> 820 cases. New coverage spans state concurrent
  regions, history pseudo-states, SDL state shapes, multi-line state labels,
  class visibility icons, Java-style class members, use case rendering
  refinements, and updated class golden snapshots.

## [0.7.0] - 2026-05-30

### Added

- **Salt wireframe diagrams.** Added first-class `@startsalt` parsing and
  layout for compact UI mockups, including text rows, buttons, radio buttons,
  checkboxes, text fields, and droplists. The previous Salt placeholder golden
  has been replaced with real parser, layout, and golden coverage.
- **Nwdiag network diagrams.** Added first-class `@startnwdiag` support for
  named and anonymous networks, network address labels, member nodes with
  addresses, top-level nodes, cloud-shaped nodes, and top-level links.
- **Archimate macro pre-processing.** Common `<archimate/Archimate>` element
  and relationship macros are expanded into supported PlantUML declarations,
  while unsupported preprocessor directives, sprites, legends, listsprite
  blocks, and scoped skinparam noise are stripped or surfaced as placeholders.
- **Timing diagram expansion.** Timing diagrams now cover named time anchors
  and offsets, track-scoped events, `scale ... as ... pixels`, date and clock
  stamps, `use date format`, hidden/manual time-axis directives, state notes,
  hidden states, inter-track measurements, and analog tracks with optional
  y-ranges.
- **Gantt scheduling expansion.** Gantt diagrams now parse and render relative
  day offsets, aliases, dependencies, weekly print scales, calendar week
  labels, milestones, working-day scheduling with closed dates/weekdays,
  same-row tasks, bottom notes, colored/named ranges, today markers, and
  additional natural-language task timing forms.
- **Sequence compatibility refinements.** Sequence diagrams now support
  activation colors, standalone destroy markers, `ignore newpage`,
  `hide footbox`, `group ... [secondary]`, first-line `hnote`/`rnote` blocks,
  note alignment with `/`, PlantUML-style delays and dividers, and
  `actorStyle` variants such as awesome and hollow.
- **Class namespace support.** Class diagrams now honor `set separator`,
  automatically materialize nested package frames for namespaced class names,
  preserve quoted class names literally, and support `set separator none`.
- **SVG image primitives.** The scene model and SVG renderer now include an
  image shape with both `href` and `xlink:href` output for broader SVG
  consumer compatibility.

### Changed

- **Sequence layout behavior is closer to PlantUML.** Bare delays no longer
  draw a full horizontal line, long delays avoid crossing participant lanes,
  dividers render as double parallel lines, note spacing expands for outer and
  side-by-side notes, and destroyed lifelines keep their bottom headers while
  truncating correctly.
- **Demo samples keep pace with supported syntax.** Archimate and timing
  samples were expanded, and the demo entry point/sample modules were updated
  to exercise the new parser and layout surfaces.

### Fixed

- **Sequence rendering edge cases.** Autonumber labels now recover from
  unclosed font/bold tags, standalone destroy markers render a red cross at
  the correct point, activation colors are carried into bars, and divider,
  delay, note, and lifeline bounds avoid unintended overlaps.
- **Gantt calendar and dependency edge cases.** Weekly axes, negative week
  ranges, closed-date bands, working-day offsets, dependency arrows,
  milestones, same-row tasks, today markers, and colored ranges are covered by
  focused parser/layout tests.
- **Timing label and geometry edge cases.** Date-domain labels, hidden axes,
  inline notes, omitted hidden states, measurement lines, analog graphs, and
  y-range labels now have dedicated layout coverage.

### Tests

- Added parser, layout, and golden coverage for Salt, Nwdiag, Archimate
  pre-processing, timing, Gantt, sequence refinements, class namespaces, SVG
  image rendering, detector behavior, and demo-backed samples.

## [0.6.0] - 2026-05-29

### Added

- **Demo sample gallery.** The demo was rebuilt from a single editor/preview
  page into a sidebar-driven gallery with per-kind example cards and dedicated
  sample modules for sequence, use case, class, activity, component,
  deployment, object, state, timing, regex, Gantt, mindmap, WBS, EBNF, JSON,
  YAML, and placeholder-oriented Network/Wireframe/Archimate examples.
- **Shared `skinparam` extraction and handwritten notices.** Sequence and use
  case parsers now collect one-line and block `skinparam` directives into AST
  skin maps. Layouts apply supported color/font tokens and render the
  PlantUML-style handwritten warning notice for `skinparam handwritten true`.
- **Sequence compatibility sweep.** Added support for participant `order`,
  colon actor shorthand (`:Actor:`), participant stereotypes/spots,
  `box ... end box`, slanted duration arrows (`->(N)` / `(N)<-`), per-message
  activation/deactivation suffixes (`++`, `--`, `++--`, `--++`), `autoactivate`,
  `return`, create/destroy markers, found/lost boundary messages (`[->`,
  `->]`, `?->`, `->?`), `mainframe`, `hide unlinked`, colored `alt` / `else`
  branches, and `<style>` `LineStyle` handling for lifelines, arrows, delays,
  and participant boxes.
- **Extended markup rendering.** Sequence/activity label markup now supports
  `<U+XXXX>`, OpenIconic/emoji placeholders, `<img:...>` placeholders,
  `<font:...>`, `<color:...>`, `<back:...>`, `<size:...>`, colored underline /
  strike / wave tags, and Creole escaping such as `~__not underlined__`.
- **Use case compatibility sweep.** Added richer declarations and layout for
  aliased shorthand use cases, actor/use case stereotypes, business actors and
  business use cases (`/` shorthand), free-standing and attached notes,
  reverse arrow normalization, bare-id actor endpoints, paren use case
  endpoints, single-dot dashed arrows, inline direction hints, `left to right`
  / `top to bottom` direction, actorStyle variants, and skinparam stereotype
  overrides.
- **Class diagram compatibility sweep.** Added `$`-prefixed class names,
  leading `$tag` tolerance, `remove` directives, declaration visibility
  prefixes, `left to right` / `top to bottom` direction, inline directional
  arrows, inline `extends` / `implements`, comma-separated inheritance lists,
  and inline `#` style blocks for fill, border, line style, header fill, and
  gradients.
- **Container/object/deployment coverage.** Component diagrams now parse
  `() "Name"` interface shorthand, bracket display names, inline colors, and
  multi-line bracket labels. Deployment/container diagrams now cover additional
  shape keywords (`agent`, `card`, `file`, `hexagon`, `process`, `stack`,
  `package`, `action`, `usecase`, `map`) plus inline style fields and deeper
  arbitrary nesting. Object diagrams now support `map Name { key => value }`
  nodes and literal angle-bracket display names.
- **Activity, Gantt, JSON/YAML, state, and tree extensions.** Activity diagrams
  support `*` bullet shorthand with nested bullet children and style blocks.
  Gantt parsing/layout now handles explicit starts/ends, compound
  day/week durations, sections, and ordinal day axes when no project start
  date exists. JSON/YAML support `<style>` class/highlight styling. State nodes
  accept inline style suffixes, while mindmap/WBS nodes support Markdown-style
  headings, arithmetic notation, boxless WBS nodes, side hints, and inline
  colors.

### Changed

- **Diagram detection is broader and less collision-prone.** Detection now
  recognizes found/lost sequence boundary messages, sequence delay lines,
  colon-actor shorthand, use-case paren and business markers, component
  `()` interface shorthand, `*`/`-` activity bullet shortcuts, additional
  deployment shape keywords, and object `map` blocks while avoiding known
  class/sequence/activity false positives.
- **Layered layouts gained direction and style awareness.** Class and use case
  layout can swap between TB and LR flow, use inline direction hints for
  satellite placement, and propagate richer edge/node styling through shared
  edge drawing.
- **JSON/YAML key-value layout styling was generalized.** Highlighted rows can
  now use named style classes with custom value-cell background, font color,
  weight, and style instead of only the default highlight fill.

### Fixed

- **Sequence lane and annotation bounds.** Hidden unlinked participants,
  participant boxes, boundary messages, short boundary stubs, slanted arrows,
  mainframe borders, and styled group/delay surfaces now render without
  creating phantom participants or clipping geometry.
- **Use case rendering regressions.** Multi-line use case labels with
  separators render as rounded blocks while single-line use cases remain
  ellipses; note connectors are dashed; reverse arrows and aliased use cases
  normalize to the intended source/target.
- **Nested container routing and rendering.** Deep nesting, parallel nested
  edges, shape-specific rendering, footer markup, and multi-line labels are
  covered for component/deployment/object diagrams.

### Tests

- Test suite grew from 375 → 622 cases. New coverage spans sequence
  compatibility features, use case skin/note/business/direction behavior,
  class remove/direction/style/inline inheritance behavior, deployment and
  object shape parsing/rendering, activity bullets and markup, Gantt
  scheduling, JSON/YAML style classes, state inline styles, tree notation,
  detector disambiguation, and the expanded demo-facing examples.

## [0.5.0] - 2026-05-26

### Added

- **Sequence note variants.** Sequence diagrams now parse and render
  `hnote` and `rnote` alongside regular `note`, including inline and block
  forms, `endhnote` / `endrnote` / spaced end forms, and optional `#color`
  fills for side, over, and across notes.
- **Sequence `note across`.** Added `note across`, `hnote across`, and
  `rnote across` for diagram-wide notes that span the full page width.
- **Sequence references.** Added `ref over A[, B, ...]` in inline and block
  forms, rendering a tabbed `ref` box that spans the target lanes and supports
  multi-line body text.
- **Sequence long delays.** Added `... long delay ...` parsing/rendering as a
  centered dashed delay annotation, distinct from boxed `== divider ==`
  dividers.
- **Extended sequence label markup.** Extracted shared sequence markup helpers
  and expanded supported Creole/HTML-like styling to include monospace
  (`""text""`), strikethrough (`--text--`, `<s>`, `<strike>`), underline
  (`__text__`, `<u>`), waved underline (`~~text~~`), bold, italic, and font
  colors. Participant headers now use the same markup measurement/rendering as
  message labels and notes.
- **Sequence `partition` groups.** Added `partition <label>` as a sequence
  group kind, rendered with the existing tabbed group frame style.

### Changed

- **Sequence note and ref spacing.** Lane gaps and diagram bounds now expand
  for side notes, single-lane refs, multi-lane refs, and across notes so wide
  annotations do not clip or overlap neighbouring participants.
- **Sequence AST note/ref surface.** Notes now carry a `shape`, flexible target
  list, optional `color`, and `across` position; dividers now distinguish
  boxed dividers from delay annotations; refs are represented as first-class
  sequence statements.

### Fixed

- **Markup rendering consistency.** Participant labels, messages, notes, and
  refs now share the same span renderer so styled text is measured and drawn
  consistently across sequence diagram surfaces.
- **Wide sequence annotations.** `note left of` on the first or inner lanes,
  `note right of` on later lanes, and wide single-lane `ref over X` boxes now
  grow the canvas/gaps instead of being clipped at the SVG edge.

### Tests

- Test suite grew from 356 → 375 cases. New coverage includes colored notes,
  `hnote` / `rnote`, `note across`, `ref over`, long delays, partition groups,
  extended Creole markup, participant-label markup, side-note spacing, and the
  updated sequence notes golden snapshot.

## [0.4.0] - 2026-05-26

### Added

- **Richer sequence diagram syntax.** Sequence participants now support
  per-participant colors (`actor Bob #red`, `participant X #99FF99`),
  escaped multi-line labels (`"first\nsecond"`), and sectioned
  `participant X [ ... ]` blocks with simple bold and monospace Creole-style
  lines. Sequence AST exports now include participant section and arrow marker
  types.
- **Sequence arrow variants and coloring.** Message parsing/rendering now
  supports open arrowheads (`->>`), bidirectional arrows (`<->`), half-arrow
  forms (`-\`, `\\-`, `//--`), lost/found markers (`x`, `o`), and per-message
  arrow colors via `-[#color]>` / `-[#hex]->`.
- **Sequence page features.** Added `newpage`, inline/block `header` and
  `footer`, shorthand `note left` / `note right` attached to the previous
  message, block comments (`/' ... '/`), and literal `\n` handling in message
  text.
- **Advanced sequence autonumber.** `autonumber` now supports multi-level
  counters (`1.1.1`), `inc A` / `inc B`, `stop`, `resume`, custom steps, and
  format strings with simple HTML-like markup. Sequence labels and notes also
  resolve `%autonumber%`, `<U+XXXX>` escapes, and basic bold/italic/underline
  / font-color markup.
- **Class `hide empty members` compact badges.** Empty classes render as
  compact icon badges when the directive is present, while classes with
  members keep the normal compartment box layout.
- **Class label direction markers.** Relationship labels written as
  `label >` or `< label` now preserve a `labelDirection` field and render a
  small direction triangle beside the edge label.
- **Activity dash action shorthand.** Lines like `- Action 1` inside
  `@startuml` are accepted as activity action steps for compatibility with
  PlantUML-like viewers that treat markdown-style lists as sequential flows.

### Changed

- **Diagram detection is less eager.** The dispatcher now keeps scanning after
  unknown identifiers and uses arrow signatures to distinguish class-only
  relationship diagrams from sequence diagrams. Plain `->` / `-->` still
  falls back to sequence, while `<|`, `|>`, `*--`, `o--`, `..`, single-dash
  class associations, and less-common class markers point to class diagrams.
- **Class relationship parsing is more permissive.** Single-dash associations
  (`A - B`) and non-standard marker forms such as `#--`, `x--`, `}--`, `+--`,
  and `^--` now parse as relationships and degrade unsupported markers to
  plain-line endpoints instead of dropping the edge.

### Fixed

- **Reverse sequence self-messages.** `A <- A` now renders the self-message loop
  and label to the left of the lifeline, with extra left padding so the loop
  and label are not clipped.
- **Multi-line sequence labels.** Participant labels, regular message labels,
  self-message labels, and note labels now split escaped `\n` into stacked
  rendered text lines instead of showing a literal backslash-n.
- **Class diagrams with relationship-only input.** Files that contain only
  relationship lines such as `A - B`, `A *-- B`, or `A .. B` are no longer
  misclassified as sequence diagrams.

### Tests

- Test suite grew from 305 → 356 cases. New coverage includes extended
  sequence parser/layout features, class compact badges and label direction
  markers, class-only detection heuristics, dash-action activity parsing, and
  the updated reverse self-message golden snapshot.

## [0.3.0] - 2026-05-25

### Added

- **Timing diagrams.** `robust`, `concise`, `binary`, and `clock` lines are now
  detected as `timing` diagrams and wired through the public parser/layout
  pipeline. The parser handles quoted track names, aliases, `@time` and
  relative `@+N` markers, quoted multi-word states, implicit concise tracks for
  undeclared references, and `clock ... with period N`. The layout renders
  state lanes, binary signal traces, clock ticks, a shared time axis, title
  text, label truncation for narrow segments, and overlap-pruned tick labels.
  Public exports include `parseTiming`, `TimingAst`, `TimingTrack`,
  `TimingTrackKind`, and `TimingEvent`.
- **YAML diagrams.** `@startyaml` now renders as a key-value tree instead of a
  placeholder, reusing the JSON table graph layout. The built-in YAML parser
  supports plain mappings and sequences, quoted scalars, numbers, booleans,
  nulls, inline flow arrays/objects, comments, block scalars, anchors,
  aliases, `<<` merge keys, `title`, and `#highlight "path" / "segments"`.
  Public exports include `parseYaml` and `YamlAst`.
- **Use case system boundaries.** Use case diagrams now parse and render
  `rectangle`, `package`, `node`, `frame`, `cloud`, and `folder` container
  blocks, preserving child use cases inside a labelled boundary rectangle.
  `UCContainer` is exported as part of the public AST surface.
- **Deployment component shorthand in nested blocks.** Deployment diagrams now
  accept `[Component]` shorthand inside container blocks and normalize
  `[Component]` relationship endpoints, including nested deployment examples
  such as web/database/cloud nodes containing component children.

### Changed

- **Shared key-value tree layout.** JSON layout now exposes a reusable
  `layoutKvTree` helper so YAML and JSON share the same graph-of-tables
  renderer while keeping diagram-specific parse error labels.
- **Long-edge coordinate assignment.** Class, use case, state, and container
  layered layouts now share `assignCoordinates`, which preserves existing
  real-node placement while relaxing dummy nodes toward their segment
  neighbours. This keeps long edges straighter without shifting established
  box positions.

### Fixed

- **Activity branch labels no longer sit on diagonal arrows.** Labels on
  diagonal `if` / `else` branch arrows are now offset perpendicular to the
  line, while near-vertical arrows keep the previous side-label placement.
  Golden snapshots for affected activity diagrams were updated.
- **Nested container edge clipping.** Edges between nodes inside different
  top-level deployment/container boxes now clip at the outer ancestor boundary
  instead of the inner leaf, so cross-container arrows do not run through
  sibling content inside the source container.
- **Parallel nested container edges.** Multiple edges declared between the same
  nested node pair now receive lateral offsets instead of being drawn directly
  on top of one another.

### Tests

- Test suite grew from 272 → 305 cases. New coverage includes timing parser
  and layout behaviour, YAML parsing/rendering/highlighting, use case
  containers, deployment `[Component]` shorthand in nested blocks, nested
  container edge clipping/parallel routing, and Sugiyama dummy coordinate
  straightening.

## [0.2.0] - 2026-05-25

### Added

- **Preprocessor warning banner.** When the source contains directives the
  library does not implement (`!theme`, `!pragma`, `!include`, `!define`,
  `!undef`, `!procedure`, `!function`, `!if`, `!while`, `!foreach`, `!$var`,
  `!log`, `!assert`), a small yellow `Preprocessor not supported: …` banner
  is drawn in the top-right corner of the SVG so the diagram author can tell
  at a glance why the output differs from upstream PlantUML. Closing
  directives (`!endif`, `!endprocedure`, …) are grouped under their opening
  form to keep the banner concise. Implemented in
  `src/preprocessor-warnings.ts`; exported as
  `detectUnsupportedDirectives(source)` and
  `applyPreprocessorWarningBanner(scene, directives)` for callers that need
  to inspect or apply the warning manually.
- **Demo page file picker.** The demo (`/demo`) now has an "Open file…"
  control next to the sample buttons that loads a local `.puml` / `.plantuml`
  / `.uml` / `.iuml` / `.wsd` / `.txt` file into the editor and re-renders
  immediately.

### Changed

- **Demo page header simplified.** `<h1>` text changed from
  "puml-canvas-js — Phase 9 (14 diagram types, ~96% coverage)" to plain
  "puml-canvas-js".

### Fixed

- **`note over A, B` rendered too narrow.** The note used only the text width
  and was centered between the two lanes, so a short label on widely-spaced
  participants drew a tiny box in the middle instead of spanning them. It
  now uses `max(text-width, span(A..B))` as the width and centers within
  that span, matching upstream PlantUML. `src/layout/sequence/index.ts`.
- **Deployment diagrams misclassified as sequence.** The diagram-type
  dispatcher was missing several deployment shape keywords, so a file
  starting with `cloud Internet` or `folder Logs` fell through to
  `sequence`. Added `cloud`, `folder`, `frame`, `storage`, `artifact` as
  strong deployment signals. `src/parser/detect.ts`.
- **`actor` / `rectangle` / `database` / `queue` keywords used for routing
  too eagerly.** These keywords appear in more than one diagram type
  (`actor` in sequence and use case, `rectangle` in component, use case
  and deployment, `database` / `queue` in sequence and deployment). The
  dispatcher used to commit on first sight, which mis-routed e.g. a use
  case diagram that opened with `actor User` to the sequence pipeline.
  These are now *weak* keywords: they record a fallback but keep scanning,
  so a stronger downstream signal (`usecase`, `node`, `cloud`, …) wins.
  `src/parser/detect.ts`.
- **`repeat while (…) is (yes) not (no)` dropped the "no" label.** The
  parser captured both labels but `layoutRepeat` only drew the back-loop
  "yes" label; the downward exit edge was unlabelled. Added the missing
  text shape next to the diamond's bottom exit so the exit branch is
  labelled the same as `while/endwhile`. `src/layout/activity/index.ts`.
- **Container diagram titles clipped on wide titles.** The SVG width was
  computed from row content only, so a title wider than the contents
  (e.g. a long deployment-topology title above a narrow column of nodes)
  was anchored at canvas center and clipped on both sides. Title width is
  now used as a floor for the canvas width, and content rows re-center
  on the widened canvas. Fixed in both
  `src/layout/container/nested.ts` and `src/layout/container/index.ts`.

### Tests

- Test suite grew from 263 → 272 cases. New file
  `tests/preprocessor-warnings.test.ts` covers directive detection
  (grouping, ordering, false-positive guards) and banner placement.
- Golden snapshots regenerated where the intended visual changed:
  `tests/golden/fixtures/sequence/notes.svg` (shared `note over` now
  spans both participant lanes) and
  `tests/golden/fixtures/usecase/basic.svg` (a basic use case diagram
  starting with `actor` previously captured the buggy sequence-style
  render as its own golden; replaced with the correct
  `<ellipse>`-based use case render).

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

[Unreleased]: https://github.com/battlecook/puml-canvas-js/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/battlecook/puml-canvas-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/battlecook/puml-canvas-js/releases/tag/v0.1.0
