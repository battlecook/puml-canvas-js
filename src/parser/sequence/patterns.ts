const NAME = String.raw`(?:"([^"]+)"|([^\s\-<>:,"]+))`;

export const WRAPPER = /^@(start|end)\w+/i;
export const LINE_COMMENT = /^\s*'/;

export const PARTICIPANT = new RegExp(
  String.raw`^(participant|actor|boundary|control|entity|database|queue|collections)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+(#\S+))?` +
    String.raw`\s*(\[)?\s*$`,
  'i',
);

export const ACTIVATE = new RegExp(String.raw`^activate\s+` + NAME + String.raw`\s*$`, 'i');
export const DEACTIVATE = new RegExp(String.raw`^deactivate\s+` + NAME + String.raw`\s*$`, 'i');

// `note left|right of NAME` is the explicit form; the shorthand `note left|right`
// attaches to the previous message's source/target — handled by the parser.
export const NOTE_SIDE_INLINE = new RegExp(
  String.raw`^note\s+(left|right)(?:\s+of\s+` + NAME + String.raw`)?\s*:\s*(.*)$`,
  'i',
);
export const NOTE_SIDE_BLOCK = new RegExp(
  String.raw`^note\s+(left|right)(?:\s+of\s+` + NAME + String.raw`)?\s*$`,
  'i',
);
export const NOTE_OVER_INLINE = new RegExp(
  String.raw`^note\s+over\s+` + NAME + String.raw`(?:\s*,\s*` + NAME + String.raw`)?\s*:\s*(.*)$`,
  'i',
);
export const NOTE_OVER_BLOCK = new RegExp(
  String.raw`^note\s+over\s+` + NAME + String.raw`(?:\s*,\s*` + NAME + String.raw`)?\s*$`,
  'i',
);
export const NOTE_END = /^end\s+note\s*$/i;

export const GROUP_START = /^(group|alt|opt|loop|par|break|critical)(?:\s+(.+))?\s*$/i;
export const GROUP_ELSE = /^else(?:\s+(.+))?\s*$/i;
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
// Inline `header X` / `footer X` and block forms `header\n…\nendheader`,
// `footer\n…\nendfooter` (parser handles the block accumulation).
export const HEADER_INLINE = /^header\s+(.+)\s*$/i;
export const FOOTER_INLINE = /^footer\s+(.+)\s*$/i;
export const HEADER_BLOCK = /^header\s*$/i;
export const FOOTER_BLOCK = /^footer\s*$/i;
export const HEADER_END = /^end\s*header\s*$/i;
export const FOOTER_END = /^end\s*footer\s*$/i;
export const DIVIDER = /^==\s*(.+?)\s*==\s*$/;

// Permissive arrow: any combination of `<>ox\/-` characters or an inline
// `[#color]` directive (e.g. `-[#red]>`, `-[#0000FF]->`). The parser validates
// that the captured string actually contains a dash before treating it as a
// message, and extracts the color separately.
export const MESSAGE = new RegExp(
  String.raw`^` + NAME +
    String.raw`\s*((?:[<>ox\\\/-]|\[#[A-Za-z0-9]+\])+)\s*` +
    NAME +
    String.raw`\s*(?::\s*(.*))?\s*$`,
);

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
