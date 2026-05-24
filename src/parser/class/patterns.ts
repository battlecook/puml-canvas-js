const CLASS_NAME = String.raw`(?:"([^"]+)"|([A-Za-z_][\w.]*(?:<(?:[^<>]|<[^<>]*>)*>)?))`;

export const CLASS_DECL = new RegExp(
  String.raw`^(abstract\s+class|abstract|class|interface|enum|annotation|record)\s+` +
    CLASS_NAME +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+<<\s*([^>]+?)\s*>>)?` +
    String.raw`\s*(\{)?\s*$`,
  'i',
);

export const BODY_OPEN = /^\{\s*$/;
export const BODY_CLOSE = /^\}\s*$/;

export const MEMBER_VISIBILITY = /^([+\-#~])\s*/;
export const MEMBER_MODIFIER = /^\{(static|abstract)\}\s*/i;
export const MEMBER_METHOD = /^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*$/;
export const MEMBER_FIELD = /^([A-Za-z_]\w*)\s*(?::\s*(.+?))?\s*$/;
export const ENUM_CONSTANT = /^([A-Za-z_]\w*)\s*$/;

export const ARROW = /(?:<\||<|o|\*)?(?:-{2,}|\.{2,})(?:\|>|>|o|\*)?/g;
export const ARROW_FULL = /^(?:<\||<|o|\*)?(?:-{2,}|\.{2,})(?:\|>|>|o|\*)?$/;
export const REL_LEFT = /^("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:"]+:|[^\s"]+)(?:\s+"([^"]+)")?\s*$/;
export const REL_RIGHT = /^(?:"([^"]+)"\s+)?("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:"]+:|[^\s"]+)\s*$/;

export const NOTE_FLOATING = /^note\s+(?:"([^"]+)"|(\S+))\s+as\s+(\S+)\s*$/i;
export const NOTE_OF_INLINE = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*:\s*(.+)$/i;
export const NOTE_OF_BLOCK = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*$/i;
export const NOTE_AS_BLOCK = /^note\s+as\s+(\S+)\s*$/i;
export const NOTE_END = /^end\s+note\s*$/i;

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
