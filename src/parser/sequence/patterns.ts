const NAME = String.raw`(?:"([^"]+)"|([^\s\-<>:,"]+))`;

export const WRAPPER = /^@(start|end)\w+/i;
export const LINE_COMMENT = /^\s*'/;

export const PARTICIPANT = new RegExp(
  String.raw`^(participant|actor|boundary|control|entity|database|queue|collections)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?\s*$`,
  'i',
);

export const ACTIVATE = new RegExp(String.raw`^activate\s+` + NAME + String.raw`\s*$`, 'i');
export const DEACTIVATE = new RegExp(String.raw`^deactivate\s+` + NAME + String.raw`\s*$`, 'i');

export const NOTE_SIDE_INLINE = new RegExp(
  String.raw`^note\s+(left|right)\s+of\s+` + NAME + String.raw`\s*:\s*(.*)$`,
  'i',
);
export const NOTE_SIDE_BLOCK = new RegExp(
  String.raw`^note\s+(left|right)\s+of\s+` + NAME + String.raw`\s*$`,
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

export const AUTONUMBER = /^autonumber(?:\s+(\d+)(?:\s+(\d+))?)?\s*$/i;

export const TITLE = /^title\s+(.+)\s*$/i;
export const DIVIDER = /^==\s*(.+?)\s*==\s*$/;

export const MESSAGE = new RegExp(
  String.raw`^` + NAME + String.raw`\s*((?:-+>+|<+-+))\s*` + NAME + String.raw`\s*(?::\s*(.*))?\s*$`,
);

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
