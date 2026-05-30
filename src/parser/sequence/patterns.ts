// `+`, `!`, `*` are also excluded so bare names don't swallow trailing
// activation / create / destroy suffixes (`B++`, `B!!`, `B**`) — the suffix
// tokens are grammar, not part of an identifier. Names containing any of these
// must be quoted.
const NAME = String.raw`(?:"([^"]+)"|([^\s\-<>:,"+!*]+))`;

export const WRAPPER = /^@(start|end)\w+/i;
export const LINE_COMMENT = /^\s*'/;

export const PARTICIPANT = new RegExp(
  String.raw`^(participant|actor|boundary|control|entity|database|queue|collections)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+(#\S+))?` +
    String.raw`(?:\s+(<<\s*.*?\s*>>))?` +
    String.raw`(?:\s+order\s+(\d+))?` +
    String.raw`\s*(\[)?\s*$`,
  'i',
);

// Colon-shorthand actor declarations:
//   `:Display Name:`              — actor whose id = display name
//   `:Display Name: as Id`        — actor with explicit id
//   `actor :Display Name: as Id`  — same with explicit `actor` keyword
// The content between the colons may contain spaces and `\n` escape sequences
// (expanded by `unescapeLabel`). Optional trailing `#color` mirrors PARTICIPANT.
//   m[1] = display name, m[2] = alias (id), m[3] = #color
export const ACTOR_COLON = new RegExp(
  String.raw`^(?:actor\s+)?:([^:]+):` +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+(#\S+))?` +
    String.raw`\s*$`,
  'i',
);

// `activate NAME [#color]` — the optional trailing `#color` fills the
// activation bar pushed by this directive. Mirrors PlantUML's `activate X #FFBBBB`
// form. When omitted, the bar uses the default activation fill.
export const ACTIVATE = new RegExp(
  String.raw`^activate\s+` + NAME + String.raw`(?:\s+(#\S+))?\s*$`,
  'i',
);
export const DEACTIVATE = new RegExp(String.raw`^deactivate\s+` + NAME + String.raw`\s*$`, 'i');
// `destroy NAME` — standalone directive (not the `!!` message suffix). Draws a
// red X marker on NAME's lifeline at the current y and truncates the lifeline
// below that point. Mirrors PlantUML's standalone `destroy` keyword.
export const DESTROY = new RegExp(String.raw`^destroy\s+` + NAME + String.raw`\s*$`, 'i');

// `note left|right of NAME` is the explicit form; the shorthand `note left|right`
// attaches to the previous message's source/target — handled by the parser.
// `hnote` (hexagon) and `rnote` (plain rectangle) are visual variants — the
// keyword is captured so the layout can pick the right shape. Optional trailing
// `#color` works on every form (block and inline, side and over).
const NOTE_KW = String.raw`(note|hnote|rnote)`;
export const NOTE_SIDE_INLINE = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+(left|right)(?:\s+of\s+` + NAME + String.raw`)?(?:\s+(#\S+))?\s*:\s*(.*)$`,
  'i',
);
export const NOTE_SIDE_BLOCK = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+(left|right)(?:\s+of\s+` + NAME + String.raw`)?(?:\s+(#\S+))?\s*$`,
  'i',
);
export const NOTE_OVER_INLINE = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+over\s+` + NAME + String.raw`(?:\s*,\s*` + NAME + String.raw`)?(?:\s+(#\S+))?\s*:\s*(.*)$`,
  'i',
);
export const NOTE_OVER_BLOCK = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+over\s+` + NAME + String.raw`(?:\s*,\s*` + NAME + String.raw`)?(?:\s+(#\S+))?\s*$`,
  'i',
);
// `rnote over X <first-line-text>` / `hnote over X <first-line-text>` — PlantUML
// quirk: the OPENING line of a block-form rnote/hnote may carry the first line
// of body text after the target name. The rest of the body comes from the
// lines that follow, terminated by `endrnote` / `endhnote`. Only rnote/hnote
// support this form (plain `note` does not). Tried AFTER `NOTE_OVER_BLOCK` so
// the bare (no trailing text) form takes the simpler path.
//   m[1] = shape keyword (rnote|hnote)
//   m[2]/m[3] = target name (quoted / bare)
//   m[4] = first body line (literal text)
export const NOTE_OVER_BLOCK_FIRST_LINE = new RegExp(
  String.raw`^(rnote|hnote)\s+over\s+` + NAME + String.raw`\s+(.+?)\s*$`,
  'i',
);
// `note across` (and hnote/rnote across) spans the whole diagram. No
// participant target.
export const NOTE_ACROSS_INLINE = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+across(?:\s+(#\S+))?\s*:\s*(.*)$`,
  'i',
);
export const NOTE_ACROSS_BLOCK = new RegExp(
  String.raw`^` + NOTE_KW + String.raw`\s+across(?:\s+(#\S+))?\s*$`,
  'i',
);
// Accept `end note`, `endnote`, `endrnote`, `endhnote`, `end rnote`, `end hnote`.
export const NOTE_END = /^end\s*(?:h|r)?note\s*$/i;

// Group-start grammar (PlantUML): `<kind>[#TabColor] [#BranchColor] [label]`.
// The first `#color` may attach directly to the keyword (e.g. `alt#Gold`) and
// becomes the TAB fill. An optional second `#color` (whitespace-separated) is
// the BACKGROUND fill of the FIRST branch. Everything after is the label.
//   m[1] = kind, m[2] = #tabColor, m[3] = #branchColor, m[4] = label
export const GROUP_START =
  /^(group|alt|opt|loop|par|break|critical|partition)\s*(#[A-Za-z0-9]+)?(?:\s+(#[A-Za-z0-9]+))?(?:\s+(.+?))?\s*$/i;
// `else [#BranchColor] [label]` — the optional `#color` is the background fill
// of the NEXT branch (the one this `else` opens).
//   m[1] = #branchColor, m[2] = label
export const GROUP_ELSE = /^else(?:\s+(#[A-Za-z0-9]+))?(?:\s+(.+?))?\s*$/i;
export const GROUP_END = /^end\s*$/i;

// Forms:
//   autonumber                                  — set, defaults 1/1
//   autonumber <N>(.<M>(.<K>...))               — set with multi-level start
//   autonumber <start> <step>                   — set with start + step
//   autonumber ... "format"                     — any of the above + format
//   autonumber stop
//   autonumber resume [<step>] ["format"]
//   autonumber inc <A-Z>                        — increment a level, reset below
// Group 1: stop|resume mode (when present)
// Group 2: step for resume
// Group 3: inc level letter
// Group 4: start for set (digits + dots)
// Group 5: step for set
// Group 6: format string
export const NEWPAGE = /^newpage(?:\s+(.+?))?\s*$/i;
// `ignore newpage` — diagram-level directive that disables `newpage` page
// breaks entirely. When present, every `newpage` statement is silently dropped
// by the layout so the diagram renders as a single continuous page.
export const IGNORE_NEWPAGE = /^ignore\s+newpage\s*$/i;

export const AUTONUMBER = new RegExp(
  String.raw`^autonumber` +
    String.raw`(?:` +
      String.raw`\s+(stop|resume)(?:\s+(\d+))?` +
      String.raw`|\s+inc\s+([A-Z])` +
      String.raw`|\s+(\d+(?:\.\d+)*)(?:\s+(\d+))?` +
    String.raw`)?` +
    String.raw`\s*(?:"([^"]*)")?\s*$`,
  'i',
);

export const TITLE = /^title\s+(.+)\s*$/i;
// `mainframe <label>` — wraps the whole diagram in a bordered rectangle with
// a small folded-corner tab in the top-left containing the label. The label
// keeps inline markup (`**bold**`, etc.) for the layout pipeline to render.
// One directive per diagram; later occurrences overwrite earlier ones.
export const MAINFRAME = /^mainframe\s+(.+?)\s*$/i;
// Inline `header X` / `footer X` and block forms `header\n…\nendheader`,
// `footer\n…\nendfooter` (parser handles the block accumulation).
export const HEADER_INLINE = /^header\s+(.+)\s*$/i;
export const FOOTER_INLINE = /^footer\s+(.+)\s*$/i;
export const HEADER_BLOCK = /^header\s*$/i;
export const FOOTER_BLOCK = /^footer\s*$/i;
export const HEADER_END = /^end\s*header\s*$/i;
export const FOOTER_END = /^end\s*footer\s*$/i;
// `ref over A[, B, ...]` — single-line form ends with `: text`, block form
// is followed by lines until `end ref`. The target list is captured loosely
// (commas + names, possibly quoted) and split in the parser.
export const REF_OVER_INLINE = /^ref\s+over\s+(.+?)\s*:\s*(.*)$/i;
export const REF_OVER_BLOCK = /^ref\s+over\s+([^:]+?)\s*$/i;
export const REF_END = /^end\s*ref\s*$/i;

export const DIVIDER = /^==\s*(.+?)\s*==\s*$/;
// PlantUML "long delay" — renders as a dashed centered annotation (no
// surrounding box). Three accepted forms:
//   `...`                  — bare delay, no label
//   `... <text>`           — labeled delay; the label is everything after the
//                            three dots (trailing `...` optional)
//   `... <text> ...`       — same as above, trailing `...` stripped
// The label capture is greedy then has any trailing `...` peeled off.
export const DELAY = /^\.\.\.\s*(?:(.*?)\s*(?:\.\.\.)?)?\s*$/;

// Permissive arrow: any combination of `<>ox\/-` characters or an inline
// `[#color]` directive (e.g. `-[#red]>`, `-[#0000FF]->`). The parser validates
// that the captured string actually contains a dash before treating it as a
// message, and extracts the color separately.
// A `(\d+)` group may also appear directly adjacent to the arrow body — on
// the OUTGOING side — to express a slanted/timed arrow (`A ->(10) B`,
// `A (10)<- B`). The parser strips it out as `duration` after matching.
// Trailing suffixes between the target name and the `:` label:
//   `#RRGGBB` / `#name`   — arrow color (also colors the autoactivate bar)
//   `**`                  — create the target participant at this message
//   `!!`                  — destroy the target after this message
//   `++`                  — activate the target on this message
//   `--`                  — deactivate the sender on this message
//   `++--` / `--++`       — both (activate target AND deactivate sender)
// Suffix tokens may appear in any order, separated by optional whitespace.
export const MESSAGE = new RegExp(
  String.raw`^` + NAME +
    String.raw`\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\]|\(\d+\))+)\s*` +
    NAME +
    String.raw`((?:\s*(?:#[A-Za-z0-9]+|\*\*|!!|\+\+--|--\+\+|\+\+|--))*)` +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);

// "Found" / "lost" messages — one end is the diagram boundary (`[` left edge
// or `]` right edge) instead of a participant. The arrow grammar is identical
// to MESSAGE; the `[#color]` directive is excluded from the boundary marker by
// requiring the leading `[` to be immediately followed by an arrow character
// (not `#`). Trailing suffixes / colon-text follow the same shape as MESSAGE.
export const MESSAGE_FROM_LEFT = new RegExp(
  String.raw`^\[\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\]|\(\d+\))+)\s*` +
    NAME +
    String.raw`((?:\s*(?:#[A-Za-z0-9]+|\*\*|!!|\+\+--|--\+\+|\+\+|--))*)` +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);
export const MESSAGE_TO_RIGHT = new RegExp(
  String.raw`^` + NAME +
    String.raw`\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\]|\(\d+\))+)\s*\]` +
    String.raw`((?:\s*(?:#[A-Za-z0-9]+|\*\*|!!|\+\+--|--\+\+|\+\+|--))*)` +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);

// "Short" found/lost messages — same as MESSAGE_FROM_LEFT / MESSAGE_TO_RIGHT
// but the boundary marker is `?` instead of `[` / `]`. The other end is the
// named participant; the `?` end is drawn as a short stub right next to that
// participant's lifeline rather than at the diagram edge.
//   `?-> Alice`    short tail just left of Alice
//   `?<- Alice`    reversed (head sits to the left of Alice)
//   `Alice ->?`    short head just right of Alice
//   `Alice <-?`    reversed
export const MESSAGE_FROM_SHORT = new RegExp(
  String.raw`^\?\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\]|\(\d+\))+)\s*` +
    NAME +
    String.raw`((?:\s*(?:#[A-Za-z0-9]+|\*\*|!!|\+\+--|--\+\+|\+\+|--))*)` +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);
export const MESSAGE_TO_SHORT = new RegExp(
  String.raw`^` + NAME +
    String.raw`\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\]|\(\d+\))+)\s*\?` +
    String.raw`((?:\s*(?:#[A-Za-z0-9]+|\*\*|!!|\+\+--|--\+\+|\+\+|--))*)` +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);

// `box "Title"? #Color?` — opens a grouping rectangle around the participants
// declared inside it. Both the title (quoted, or bare word) and the trailing
// color are optional. `end box` (or `endbox`) closes the group.
export const BOX_START = /^box(?:\s+(?:"([^"]*)"|([^\s#][^\s]*?)))?\s*(?:(#\S+))?\s*$/i;
export const BOX_END = /^end\s*box\s*$/i;

export const AUTOACTIVATE = /^autoactivate(?:\s+(on|off))?\s*$/i;
// `hide unlinked` — filters out participants never referenced by any message,
// activate/deactivate, note, or ref. Other `hide ...` variants (e.g.
// `hide footbox`, `hide empty members`) are accepted as no-ops so they don't
// leak through to the message parser. The capture group holds the rest of
// the line lower-cased for `hide unlinked` detection.
export const HIDE = /^hide\s+(.+?)\s*$/i;
// `return [text]` — dashed reply back to the previous sender, popping one
// autoactivate level. Text is optional.
export const RETURN = /^return(?:\s+(.*))?\s*$/i;

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
