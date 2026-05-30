export type ParticipantShape =
  | 'participant'
  | 'actor'
  | 'boundary'
  | 'control'
  | 'entity'
  | 'database'
  | 'queue'
  | 'collections';

export type ParticipantLineStyle = 'normal' | 'bold' | 'mono';

export interface ParticipantLine {
  text: string;
  style: ParticipantLineStyle;
}

export interface ParticipantSection {
  lines: ParticipantLine[];
}

export interface ParticipantStereotype {
  /** Text inside `<<…>>` minus an optional leading `(X,#color)` spot block. */
  label?: string;
  /** Optional `(X,#RRGGBB)` color-spot (UML class-diagram convention). */
  spot?: { char: string; color: string };
}

/**
 * `box "Title" [#Color] ... end box` — groups consecutive participants under
 * a colored bounding rectangle. Membership is tracked per-participant via the
 * `box` field below; the layout reconstructs the bounding rectangle by
 * grouping contiguous lanes that share the same `box.id`.
 */
export interface ParticipantBox {
  /** 1-based counter, unique per `box ... end box` pair. */
  id: number;
  /** Optional title rendered at the top-left inside the box. */
  title?: string;
  /** Optional background fill (CSS-resolvable color string). */
  color?: string;
}

export interface Participant {
  id: string;
  label: string;
  shape: ParticipantShape;
  color?: string;
  /** Multi-section content from `participant X [ ... ]` blocks. */
  sections?: ParticipantSection[];
  /** Optional `<< ... >>` stereotype block at the end of the declaration. */
  stereotype?: ParticipantStereotype;
  /** Set when this participant was declared inside a `box ... end box`. */
  box?: ParticipantBox;
  /**
   * Explicit column-order hint from the `order N` suffix on a participant
   * declaration. Lower N renders to the left. Participants without an
   * explicit `order` keep their declaration position; the layout stable-sorts
   * the list using `order ?? +Infinity` so explicit-order entries are placed
   * first in ascending order and the rest preserve declaration order.
   */
  order?: number;
}

export type ArrowStyle = 'solid' | 'dashed';

/**
 * Marker drawn at either end of a sequence arrow.
 *
 *  - `arrow`       : `>` / `<` filled triangle (default)
 *  - `arrow-open`  : `>>` / `<<` two-stroke open arrow head (async style)
 *  - `half-up`     : `\` upper-only diagonal stroke
 *  - `half-down`   : `/` lower-only diagonal stroke
 *  - `x`           : `x` lost-message cross
 *  - `circle`      : `o` filled circle
 */
export type ArrowMarker =
  | 'none'
  | 'arrow'
  | 'arrow-open'
  | 'half-up'
  | 'half-down'
  | 'x'
  | 'circle';

export interface MessageStmt {
  type: 'message';
  from: string;
  to: string;
  text: string;
  style: ArrowStyle;
  reverse: boolean;
  /** Marker at the source ("from") side of the arrow. Defaults to 'none'. */
  startMarker?: ArrowMarker;
  /** Marker at the target ("to") side of the arrow. Defaults to 'arrow'. */
  endMarker?: ArrowMarker;
  /** Per-message color from a `[#color]` directive in the arrow. */
  color?: string;
  /** `A -> B **` — B's lifeline starts at this message. */
  create?: boolean;
  /** `A -> B !!` — B's lifeline ends at this message (red X marker). */
  destroy?: boolean;
  /**
   * `A -> B ++` — push a new activation frame on B (the target) at the same
   * point an autoactivate would, but only on this single message. Uses the
   * message's `color` if present, else the default activation fill.
   */
  activateTarget?: boolean;
  /**
   * `A -> B --` — pop one activation frame from A (the sender). PlantUML's
   * "reply and deactivate self" shorthand: applies right at the arrow's y.
   */
  deactivateSource?: boolean;
  /**
   * "Found message" — the `from` end is the diagram's left/right edge instead
   * of a participant. `from` is the empty string when set. PlantUML syntax:
   *   `[-> Bob`         (left boundary, tail at diagram edge)
   *   `Bob <-]`         (right boundary, reversed so the source is the boundary)
   *   `?-> Bob`         (short-left, tail is a short stub just left of Bob)
   *   `Bob <-?`         (short-right, reversed, tail just right of Bob)
   */
  fromBoundary?: 'left' | 'right' | 'short-left' | 'short-right';
  /**
   * "Lost message" — the `to` end is the diagram's left/right edge instead of
   * a participant. `to` is the empty string when set. PlantUML syntax:
   *   `Bob ->]`         (right boundary, head at diagram edge)
   *   `[<- Bob`         (left boundary, reversed so the target is the boundary)
   *   `Bob ->?`         (short-right, head is a short stub just right of Bob)
   *   `?<- Bob`         (short-left, reversed, head just left of Bob)
   */
  toBoundary?: 'left' | 'right' | 'short-left' | 'short-right';
  /**
   * `A ->(N) B` / `A (N)<- B` — "slanted" / timed arrow. N is a non-negative
   * integer expressing latency, drawn as a downward slope: the arrow's tail
   * starts at the sender's lifeline at the message's y, and the head lands on
   * the receiver's lifeline at `y + N * DURATION_SCALE`. Undefined when the
   * arrow is the normal horizontal form.
   */
  duration?: number;
}

/**
 * `return [label]` — dashed reply arrow back to the most recent sender that
 * has an open activation, popping one level of the autoactivate stack on the
 * current responder.
 */
export interface ReturnStmt {
  type: 'return';
  text: string;
}

/**
 * `autoactivate on|off` — toggles automatic activation: every subsequent
 * message activates its target's lifeline; every `return` deactivates one
 * level on the sender.
 */
export interface AutoActivateStmt {
  type: 'autoactivate';
  enabled: boolean;
}

export type NotePosition = 'left' | 'right' | 'over' | 'across';

/**
 * Note shape variants:
 *   - `note`  (default) : folded rectangle (top-right corner triangle).
 *   - `hnote`           : hexagon (left/right edges pinched to a point).
 *   - `rnote`           : plain rectangle (no fold flap).
 */
export type NoteShape = 'note' | 'hnote' | 'rnote';

export interface NoteStmt {
  type: 'note';
  shape: NoteShape;
  position: NotePosition;
  /**
   * Participant IDs the note attaches to:
   *   - `left`/`right`: exactly one target
   *   - `over`: one or two targets (start, end)
   *   - `across`: empty array — note spans the whole diagram
   */
  targets: string[];
  text: string;
  /** Optional `#color` background from `note … #color` directive. */
  color?: string;
  /**
   * True when the source used the shorthand `note left` / `note right` (no
   * `of NAME`) form, so the target was resolved via the previous message. The
   * layout uses this to (a) re-target to the outer side of the message in
   * lane-order, and (b) place the note adjacent to that message's arrow.
   */
  shorthand?: boolean;
  /**
   * `/` directive — when present, the parser saw a bare `/` line immediately
   * before this note. The layout aligns this note to the SAME y as the most
   * recently drawn note (PlantUML "place side-by-side" behavior), so two
   * notes can share a row.
   */
  alignToPrev?: boolean;
}

export interface ActivateStmt {
  type: 'activate';
  target: string;
  /**
   * Optional `#color` from `activate NAME #color` — fills the activation bar
   * pushed by this directive. May be a hex (`#FFBBBB`) or a CSS / X11 named
   * color (`#DarkSalmon`). When undefined the layout falls back to the
   * default activation fill.
   */
  color?: string;
}

export interface DeactivateStmt {
  type: 'deactivate';
  target: string;
}

/**
 * `destroy NAME` — standalone directive (distinct from the `!!` message-arrow
 * suffix). At layout time, draws a red X marker on NAME's lifeline at the
 * current y and truncates the lifeline below that point.
 */
export interface DestroyStmt {
  type: 'destroy';
  target: string;
}

export type GroupKind =
  | 'group'
  | 'alt'
  | 'opt'
  | 'loop'
  | 'par'
  | 'break'
  | 'critical'
  | 'partition';

export interface GroupStartStmt {
  type: 'groupStart';
  kind: GroupKind;
  label: string;
  /** Optional secondary label parsed from a trailing `[bracketed]` suffix on
   *  the group-start line, e.g. `group My own label [My own label 2]`. The
   *  primary `label` carries the text before the brackets; `label2` carries
   *  the bracketed text (sans brackets). Rendered to the right of the tab. */
  label2?: string;
  /** Optional fill color for the small folded-corner tab in the top-left.
   *  Parsed from `alt#Gold` or `alt #Gold` (the first `#color` token). */
  tabColor?: string;
  /** Optional background fill for the FIRST branch's body (between the tab
   *  strip and the first `else` divider, or the bottom if there is no
   *  `else`). Parsed from the SECOND `#color` token on the start line. */
  branchColor?: string;
}

export interface GroupElseStmt {
  type: 'groupElse';
  label: string;
  /** Optional background fill for the NEXT branch's body (from this `else`
   *  down to the next `else` or `end`). Parsed from the `#color` token
   *  immediately after `else`. */
  branchColor?: string;
}

export interface GroupEndStmt {
  type: 'groupEnd';
}

/**
 * `autonumber` has four usage modes:
 *   - `set`    : `autonumber [start [step]] [format]` — (re)initialise the
 *                counter. `start` can be a single integer (`10`) or a multi-
 *                level value (`1.1.1`) given as an array of levels.
 *   - `stop`   : `autonumber stop` — pause prefixing without touching state.
 *   - `resume` : `autonumber resume [step] [format]` — re-enable from the
 *                paused counter, optionally updating step / format.
 *   - `inc`    : `autonumber inc <letter>` — increment a specific level
 *                (A=0, B=1, …) and reset every level below it to 1.
 */
export interface AutoNumberStmt {
  type: 'autonumber';
  mode: 'set' | 'stop' | 'resume' | 'inc';
  /** Starting counter for `set`. Multi-level numbers map to `[1, 1, 1]`. */
  start?: number[];
  /**
   * Step. For `set`, defaults to 1. For `resume`, present only when an
   * explicit step was given (undefined otherwise — layout keeps prior step).
   * Undefined for `stop` / `inc`.
   */
  step?: number;
  /** Zero-based level for `inc` mode. `inc A` → 0, `inc B` → 1, … */
  incLevel?: number;
  /**
   * Optional prefix format. Runs of `0` or `#` in the format are replaced by
   * the current number, zero-padded to the run length. May contain HTML-like
   * markup (`<b>`, `<u>`, `<font color=...>`) that the layout interprets.
   */
  format?: string;
}

/**
 * `ref over A[, B, ...] : text` — a "reference" box that visually denotes a
 * sub-sequence elided into another diagram. Renders as a folded-corner box
 * spanning the listed lanes with a small "ref" tab at the top-left.
 * Block form (`ref over A ... end ref`) supports multi-line text.
 */
export interface RefStmt {
  type: 'ref';
  targets: string[];
  text: string;
}

export interface DividerStmt {
  type: 'divider';
  label: string;
  /** `'divider'` is the boxed `==title==` form; `'delay'` is `... long delay ...`. */
  kind?: 'divider' | 'delay';
}

export interface NewPageStmt {
  type: 'newpage';
  /** Title for the new page; empty when the directive is used bare. */
  title: string;
}

export type SequenceStatement =
  | MessageStmt
  | NoteStmt
  | ActivateStmt
  | DeactivateStmt
  | DestroyStmt
  | GroupStartStmt
  | GroupElseStmt
  | GroupEndStmt
  | AutoNumberStmt
  | DividerStmt
  | NewPageStmt
  | RefStmt
  | ReturnStmt
  | AutoActivateStmt;

export interface SequenceAst {
  kind: 'sequence';
  title: string;
  /** Optional page header text (rendered in muted gray above the title). */
  header: string;
  /** Optional page footer text (rendered in muted gray below the diagram). */
  footer: string;
  participants: Participant[];
  statements: SequenceStatement[];
  /**
   * Skinparam map populated by `skinparam` directives (one-liners and block
   * form). Keys are lower-cased; group prefixes are dropped, so `skinparam
   * sequence { ArrowColor red }` lands as `arrowcolor`. Values are kept as the
   * raw token tail of the source line (e.g. `'DeepSkyBlue'`, `'#EEEBDC'`,
   * `'17'`, `'true'`, `'Impact'`). Layout resolves named colors at the point
   * of use via `resolveSkinColor`.
   */
  skin?: Record<string, string>;
  /**
   * Style map populated by `<style> selector { Property Value ... } </style>`
   * blocks. Outer key is the selector name lower-cased (`lifeline`, `delay`,
   * `arrow`, `participant`, ...). Inner key is the property name lower-cased
   * (`linestyle`, `linecolor`, ...). Value is the raw token tail of the source
   * line. Only `linestyle` is wired into the renderer this round; other
   * captured properties are intentionally no-ops.
   */
  styles?: Record<string, Record<string, string>>;
  /**
   * `hide unlinked` — when true, participants that are never referenced by any
   * message / activate / note / ref / create / destroy are filtered out at
   * layout time. The declaration order is preserved among the survivors.
   */
  hideUnlinked?: boolean;
  /**
   * `hide footbox` — when true, the bottom-repeated participant/actor header
   * row is suppressed; only the top header row is rendered. Lifelines run all
   * the way to the bottom of the diagram body.
   */
  hideFootbox?: boolean;
  /**
   * `mainframe <label>` — wraps the entire diagram body in a bordered
   * rectangle with a small folded-corner tab in the top-left containing the
   * label. The label is stored with raw inline markup (`**bold**`,
   * `//italic//`, …) intact so layout can render bold spans via
   * `parseLabelMarkup`. If the directive appears more than once, the LAST
   * occurrence wins.
   */
  mainframe?: string;
  /**
   * `ignore newpage` — when true, every `newpage` directive in the diagram is
   * dropped at layout time so the result is a single continuous page. Opposes
   * the default behaviour where the first `newpage` truncates the diagram.
   */
  ignoreNewpage?: boolean;
}
