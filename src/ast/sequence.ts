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

export interface Participant {
  id: string;
  label: string;
  shape: ParticipantShape;
  color?: string;
  /** Multi-section content from `participant X [ ... ]` blocks. */
  sections?: ParticipantSection[];
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
}

export interface ActivateStmt {
  type: 'activate';
  target: string;
}

export interface DeactivateStmt {
  type: 'deactivate';
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
}

export interface GroupElseStmt {
  type: 'groupElse';
  label: string;
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
  | GroupStartStmt
  | GroupElseStmt
  | GroupEndStmt
  | AutoNumberStmt
  | DividerStmt
  | NewPageStmt
  | RefStmt;

export interface SequenceAst {
  kind: 'sequence';
  title: string;
  /** Optional page header text (rendered in muted gray above the title). */
  header: string;
  /** Optional page footer text (rendered in muted gray below the diagram). */
  footer: string;
  participants: Participant[];
  statements: SequenceStatement[];
}
