import type {
  ActivateStmt,
  ArrowMarker,
  AutoNumberStmt,
  DeactivateStmt,
  DividerStmt,
  GroupElseStmt,
  GroupEndStmt,
  GroupKind,
  GroupStartStmt,
  MessageStmt,
  NewPageStmt,
  NotePosition,
  NoteShape,
  NoteStmt,
  Participant,
  RefStmt,
  ParticipantLine,
  ParticipantSection,
  ParticipantShape,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import {
  ACTIVATE,
  AUTONUMBER,
  NEWPAGE,
  DEACTIVATE,
  DELAY,
  DIVIDER,
  FOOTER_BLOCK,
  FOOTER_END,
  FOOTER_INLINE,
  GROUP_ELSE,
  GROUP_END,
  GROUP_START,
  HEADER_BLOCK,
  HEADER_END,
  HEADER_INLINE,
  LINE_COMMENT,
  MESSAGE,
  NOTE_ACROSS_BLOCK,
  NOTE_ACROSS_INLINE,
  NOTE_END,
  NOTE_OVER_BLOCK,
  NOTE_OVER_INLINE,
  NOTE_SIDE_BLOCK,
  NOTE_SIDE_INLINE,
  PARTICIPANT,
  REF_END,
  REF_OVER_BLOCK,
  REF_OVER_INLINE,
  TITLE,
  WRAPPER,
  extractName,
} from './patterns.js';

interface PendingNote {
  position: NotePosition;
  shape: NoteShape;
  targets: string[];
  buffer: string[];
  color?: string;
}

interface PendingPartBlock {
  participant: Participant;
  buffer: string[];
}

interface PendingRef {
  targets: string[];
  buffer: string[];
}

/**
 * Splits a comma-separated participant target list, honouring `"..."` quoted
 * names. Used by `ref over A, "Bob the Great", C` and similar directives.
 */
function parseTargetList(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (i >= s.length) break;
    let token: string;
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      if (end < 0) { token = s.slice(i + 1).trim(); i = s.length; }
      else { token = s.slice(i + 1, end); i = end + 1; }
    } else {
      let j = i;
      while (j < s.length && s[j] !== ',') j++;
      token = s.slice(i, j).trim();
      i = j;
    }
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (i < s.length && s[i] === ',') i++;
    if (token) out.push(token);
  }
  return out;
}

export function parseSequence(source: string): SequenceAst {
  const ast: SequenceAst = {
    kind: 'sequence',
    title: '',
    header: '',
    footer: '',
    participants: [],
    statements: [],
  };
  const declared = new Map<string, Participant>();
  const lines = source.split(/\r\n|\r|\n/);
  let pendingNote: PendingNote | null = null;
  let pendingPartBlock: PendingPartBlock | null = null;
  let pendingRef: PendingRef | null = null;
  let inBlockComment = false;
  let lastMessage: MessageStmt | null = null;
  let headerBuf: string[] | null = null;
  let footerBuf: string[] | null = null;

  const addParticipant = (p: Participant): void => {
    if (declared.has(p.id)) return;
    declared.set(p.id, p);
    ast.participants.push(p);
  };

  for (const raw of lines) {
    const text = raw.trim();

    if (inBlockComment) {
      if (text.includes("'/")) inBlockComment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      if (!text.includes("'/", 2)) inBlockComment = true;
      continue;
    }

    if (headerBuf !== null) {
      if (HEADER_END.test(text)) {
        ast.header = headerBuf.join('\n');
        headerBuf = null;
      } else {
        headerBuf.push(raw);
      }
      continue;
    }
    if (footerBuf !== null) {
      if (FOOTER_END.test(text)) {
        ast.footer = footerBuf.join('\n');
        footerBuf = null;
      } else {
        footerBuf.push(raw);
      }
      continue;
    }

    if (pendingPartBlock !== null) {
      const pb = pendingPartBlock as PendingPartBlock;
      if (text === ']') {
        pb.participant.sections = buildParticipantSections(pb.buffer);
        addParticipant(pb.participant);
        pendingPartBlock = null;
        continue;
      }
      pb.buffer.push(raw);
      continue;
    }

    if (pendingRef !== null) {
      const pr = pendingRef as PendingRef;
      if (REF_END.test(text)) {
        const refStmt: RefStmt = {
          type: 'ref',
          targets: pr.targets,
          text: pr.buffer.join('\n'),
        };
        ast.statements.push(refStmt);
        pendingRef = null;
      } else {
        pr.buffer.push(raw);
      }
      continue;
    }

    if (pendingNote !== null) {
      const pn = pendingNote as PendingNote;
      if (NOTE_END.test(text)) {
        const noteStmt: NoteStmt = {
          type: 'note',
          shape: pn.shape,
          position: pn.position,
          targets: pn.targets,
          text: pn.buffer.join('\n'),
        };
        if (pn.color) noteStmt.color = pn.color;
        ast.statements.push(noteStmt);
        pendingNote = null;
      } else {
        pn.buffer.push(raw);
      }
      continue;
    }

    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    const titleMatch = TITLE.exec(text);
    if (titleMatch) {
      ast.title = titleMatch[1]!.trim();
      continue;
    }

    const headerInline = HEADER_INLINE.exec(text);
    if (headerInline) {
      ast.header = headerInline[1]!.trim();
      continue;
    }
    if (HEADER_BLOCK.test(text)) {
      headerBuf = [];
      continue;
    }

    const footerInline = FOOTER_INLINE.exec(text);
    if (footerInline) {
      ast.footer = footerInline[1]!.trim();
      continue;
    }
    if (FOOTER_BLOCK.test(text)) {
      footerBuf = [];
      continue;
    }

    const stmt = parseStatement(
      text,
      addParticipant,
      (note) => { pendingNote = note; },
      (block) => { pendingPartBlock = block; },
      (ref) => { pendingRef = ref; },
      lastMessage,
    );
    if (stmt) {
      ast.statements.push(stmt);
      if (stmt.type === 'message') lastMessage = stmt;
    }
  }

  for (const stmt of ast.statements) {
    if (stmt.type === 'message') {
      addParticipant({ id: stmt.from, label: stmt.from, shape: 'participant' });
      addParticipant({ id: stmt.to, label: stmt.to, shape: 'participant' });
    } else if (stmt.type === 'note') {
      for (const t of stmt.targets) {
        addParticipant({ id: t, label: t, shape: 'participant' });
      }
    } else if (stmt.type === 'activate' || stmt.type === 'deactivate') {
      addParticipant({ id: stmt.target, label: stmt.target, shape: 'participant' });
    } else if (stmt.type === 'ref') {
      for (const t of stmt.targets) {
        addParticipant({ id: t, label: t, shape: 'participant' });
      }
    }
  }

  return ast;
}

function parseStatement(
  text: string,
  addParticipant: (p: Participant) => void,
  setPendingNote: (n: PendingNote) => void,
  setPendingPartBlock: (b: PendingPartBlock) => void,
  setPendingRef: (r: PendingRef) => void,
  lastMessage: MessageStmt | null,
): SequenceStatement | null {
  let m: RegExpExecArray | null;

  if ((m = PARTICIPANT.exec(text))) {
    const shape = m[1]!.toLowerCase() as ParticipantShape;
    const rawQuoted = m[2];
    const label = unescapeLabel(extractName(rawQuoted, m[3]));
    const id = m[4] ?? label;
    const colorRaw = m[5];
    const openBracket = m[6];
    const part: Participant = { id, label, shape };
    if (colorRaw) part.color = normalizeColor(colorRaw);
    if (openBracket) {
      // Defer registration until `]` is reached so the `sections` field is
      // populated before adding to the diagram. The block-handler in the
      // main loop calls addParticipant when it sees the closing bracket.
      setPendingPartBlock({ participant: part, buffer: [] });
      return null;
    }
    addParticipant(part);
    return null;
  }

  if ((m = NEWPAGE.exec(text))) {
    const title = m[1] ? unescapeLabel(m[1].trim()) : '';
    const stmt: NewPageStmt = { type: 'newpage', title };
    return stmt;
  }

  if ((m = AUTONUMBER.exec(text))) {
    const modeWord = m[1]?.toLowerCase();
    const incLetter = m[3];
    const mode: 'set' | 'stop' | 'resume' | 'inc' =
      modeWord === 'stop' ? 'stop'
      : modeWord === 'resume' ? 'resume'
      : incLetter ? 'inc'
      : 'set';
    const stmt: AutoNumberStmt = { type: 'autonumber', mode };
    if (mode === 'set') {
      const startTxt = m[4];
      stmt.start = startTxt ? startTxt.split('.').map(Number) : [1];
      stmt.step = m[5] ? Number(m[5]) : 1;
    } else if (mode === 'resume' && m[2]) {
      stmt.step = Number(m[2]);
    } else if (mode === 'inc') {
      // 'A' → 0, 'B' → 1, ...
      stmt.incLevel = incLetter!.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    }
    if (m[6]) stmt.format = m[6];
    return stmt;
  }

  if ((m = DIVIDER.exec(text))) {
    const stmt: DividerStmt = { type: 'divider', label: m[1]!.trim(), kind: 'divider' };
    return stmt;
  }

  if ((m = DELAY.exec(text))) {
    const stmt: DividerStmt = {
      type: 'divider',
      label: unescapeLabel((m[1] ?? '').trim()),
      kind: 'delay',
    };
    return stmt;
  }

  if ((m = ACTIVATE.exec(text))) {
    const stmt: ActivateStmt = { type: 'activate', target: extractName(m[1], m[2]) };
    return stmt;
  }

  if ((m = DEACTIVATE.exec(text))) {
    const stmt: DeactivateStmt = { type: 'deactivate', target: extractName(m[1], m[2]) };
    return stmt;
  }

  if ((m = REF_OVER_INLINE.exec(text))) {
    const targets = parseTargetList(m[1]!);
    if (targets.length === 0) return null;
    const stmt: RefStmt = {
      type: 'ref',
      targets,
      text: unescapeLabel((m[2] ?? '').trim()),
    };
    return stmt;
  }

  if ((m = REF_OVER_BLOCK.exec(text))) {
    const targets = parseTargetList(m[1]!);
    if (targets.length === 0) return null;
    setPendingRef({ targets, buffer: [] });
    return null;
  }

  if ((m = NOTE_SIDE_INLINE.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const pos = m[2]!.toLowerCase() as NotePosition;
    const explicit = extractName(m[3], m[4]);
    const target = explicit || sideNoteFallback(pos, lastMessage);
    if (!target) return null;
    const colorRaw = m[5];
    const stmt: NoteStmt = {
      type: 'note',
      shape,
      position: pos,
      targets: [target],
      text: unescapeLabel((m[6] ?? '').trim()),
    };
    if (colorRaw) stmt.color = normalizeColor(colorRaw);
    return stmt;
  }

  if ((m = NOTE_SIDE_BLOCK.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const pos = m[2]!.toLowerCase() as NotePosition;
    const explicit = extractName(m[3], m[4]);
    const target = explicit || sideNoteFallback(pos, lastMessage);
    if (!target) return null;
    const colorRaw = m[5];
    const pending: PendingNote = { position: pos, shape, targets: [target], buffer: [] };
    if (colorRaw) pending.color = normalizeColor(colorRaw);
    setPendingNote(pending);
    return null;
  }

  if ((m = NOTE_OVER_INLINE.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const a = extractName(m[2], m[3]);
    const b = extractName(m[4], m[5]);
    const targets: [string] | [string, string] = b ? [a, b] : [a];
    const colorRaw = m[6];
    const stmt: NoteStmt = {
      type: 'note',
      shape,
      position: 'over',
      targets,
      text: unescapeLabel((m[7] ?? '').trim()),
    };
    if (colorRaw) stmt.color = normalizeColor(colorRaw);
    return stmt;
  }

  if ((m = NOTE_OVER_BLOCK.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const a = extractName(m[2], m[3]);
    const b = extractName(m[4], m[5]);
    const colorRaw = m[6];
    const pending: PendingNote = {
      position: 'over',
      shape,
      targets: b ? [a, b] : [a],
      buffer: [],
    };
    if (colorRaw) pending.color = normalizeColor(colorRaw);
    setPendingNote(pending);
    return null;
  }

  if ((m = NOTE_ACROSS_INLINE.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const colorRaw = m[2];
    const stmt: NoteStmt = {
      type: 'note',
      shape,
      position: 'across',
      targets: [],
      text: unescapeLabel((m[3] ?? '').trim()),
    };
    if (colorRaw) stmt.color = normalizeColor(colorRaw);
    return stmt;
  }

  if ((m = NOTE_ACROSS_BLOCK.exec(text))) {
    const shape = m[1]!.toLowerCase() as NoteShape;
    const colorRaw = m[2];
    const pending: PendingNote = {
      position: 'across',
      shape,
      targets: [],
      buffer: [],
    };
    if (colorRaw) pending.color = normalizeColor(colorRaw);
    setPendingNote(pending);
    return null;
  }

  if ((m = GROUP_ELSE.exec(text))) {
    const stmt: GroupElseStmt = { type: 'groupElse', label: (m[1] ?? '').trim() };
    return stmt;
  }

  if (GROUP_END.test(text)) {
    const stmt: GroupEndStmt = { type: 'groupEnd' };
    return stmt;
  }

  if ((m = GROUP_START.exec(text))) {
    const stmt: GroupStartStmt = {
      type: 'groupStart',
      kind: m[1]!.toLowerCase() as GroupKind,
      label: (m[2] ?? '').trim(),
    };
    return stmt;
  }

  if ((m = MESSAGE.exec(text))) {
    const left = extractName(m[1], m[2]);
    const arrow = m[3]!;
    const right = extractName(m[4], m[5]);
    const txt = unescapeLabel((m[6] ?? '').trim());
    const info = parseArrow(arrow);
    if (!info) return null;
    // For pure backward (no `>` at the right), the visible direction is
    // right→left, so swap from/to. For bidirectional we keep source order.
    const useForward = info.bidirectional || !info.reverse;
    const stmt: MessageStmt = {
      type: 'message',
      from: useForward ? left : right,
      to: useForward ? right : left,
      text: txt,
      style: info.dashed ? 'dashed' : 'solid',
      reverse: info.reverse && !info.bidirectional,
      // Markers stored relative to the from/to ends: startMarker sits at the
      // arrow's source ("from") side, endMarker at the target ("to") side.
      startMarker: useForward ? info.leftMarker : info.rightMarker,
      endMarker: useForward ? info.rightMarker : info.leftMarker,
    };
    if (info.color) stmt.color = info.color;
    return stmt;
  }

  return null;
}

/**
 * Builds the multi-section block of a `participant X [ ... ]` declaration.
 * Lines composed of 4+ dashes (`----`) act as section separators. Within each
 * section, creole-style markers are interpreted:
 *   `=text`         → bold (typically section heading)
 *   `""mono""`      → monospace (e.g. for code snippets, subtitles, IDs)
 *   anything else   → normal
 */
function buildParticipantSections(buffer: string[]): ParticipantSection[] {
  const sections: ParticipantSection[] = [];
  let current: ParticipantLine[] = [];
  const flush = (): void => {
    sections.push({ lines: current });
    current = [];
  };
  for (const raw of buffer) {
    const trimmed = raw.trim();
    if (/^-{4,}$/.test(trimmed)) {
      flush();
      continue;
    }
    if (trimmed === '') continue;
    current.push(parseCreoleLine(trimmed));
  }
  flush();
  return sections.length === 0 ? [] : sections;
}

function parseCreoleLine(text: string): ParticipantLine {
  const monoMatch = /^""(.*)""$/.exec(text);
  if (monoMatch) {
    return { text: monoMatch[1]!, style: 'mono' };
  }
  if (text.startsWith('=')) {
    return { text: text.replace(/^=+\s*/, '').trim(), style: 'bold' };
  }
  return { text, style: 'normal' };
}

interface ArrowInfo {
  leftMarker: ArrowMarker;
  rightMarker: ArrowMarker;
  dashed: boolean;
  reverse: boolean;
  bidirectional: boolean;
  color: string | undefined;
}

/**
 * Splits a sequence arrow into its visual components.
 *
 * Examples:
 *   `->`     → leftMarker=none, rightMarker=arrow,      forward, solid
 *   `<-`     → leftMarker=arrow, rightMarker=none,      reverse, solid
 *   `<->`    → leftMarker=arrow, rightMarker=arrow,     bidirectional
 *   `->>`    → leftMarker=none, rightMarker=arrow-open, forward
 *   `->x`    → leftMarker=none, rightMarker=x,          forward
 *   `->o`    → leftMarker=none, rightMarker=circle,     forward
 *   `\\-`    → leftMarker=half-up, rightMarker=none,    forward (start marker)
 *   `//--`   → leftMarker=half-down, rightMarker=none,  dashed
 *   `-\`     → leftMarker=none, rightMarker=half-up
 */
function parseArrow(arrow: string): ArrowInfo | null {
  // Extract optional `[#color]` directive (e.g. `-[#red]>` → arrow part `->`
  // with color "red").
  let color: string | undefined;
  const colorMatch = /\[#([A-Za-z0-9]+)\]/.exec(arrow);
  if (colorMatch) {
    color = normalizeColor(`#${colorMatch[1]}`);
    arrow = arrow.replace(/\[#[A-Za-z0-9]+\]/, '');
  }
  if (!arrow.includes('-')) return null;
  const firstDash = arrow.indexOf('-');
  const lastDash = arrow.lastIndexOf('-');
  const left = arrow.slice(0, firstDash);
  const dashes = arrow.slice(firstDash, lastDash + 1);
  const right = arrow.slice(lastDash + 1);
  return {
    leftMarker: classifyMarker(left),
    rightMarker: classifyMarker(right),
    dashed: dashes.length >= 2,
    reverse: left.includes('<'),
    bidirectional: left.includes('<') && right.includes('>'),
    color,
  };
}

function classifyMarker(chars: string): ArrowMarker {
  if (chars.includes('x')) return 'x';
  if (chars.includes('o')) return 'circle';
  if (/>>|<</.test(chars)) return 'arrow-open';
  if (/[<>]/.test(chars)) return 'arrow';
  if (chars.includes('\\')) return 'half-up';
  if (chars.includes('/')) return 'half-down';
  return 'none';
}

/**
 * Resolves the target for shorthand `note right` / `note left` (no `of NAME`).
 * `note right` attaches to the previous message's target, `note left` to its
 * source. Returns '' when there's no preceding message.
 */
function sideNoteFallback(position: NotePosition, last: MessageStmt | null): string {
  if (!last) return '';
  return position === 'right' ? last.to : last.from;
}

function unescapeLabel(text: string): string {
  // Convert literal `\n` (two chars: backslash + n) inside quoted labels into
  // an actual newline. The lexer keeps the source verbatim, so the parser
  // expands these escape sequences when it sees a quoted name.
  return text.replace(/\\n/g, '\n');
}

function normalizeColor(raw: string): string {
  // PlantUML accepts `#red` (named) or `#99FF99` (hex). Named-color form is
  // not valid CSS — strip the leading `#` so the value can be used directly
  // as an SVG `fill`. Hex form keeps the leading `#`.
  if (!raw.startsWith('#')) return raw;
  const rest = raw.slice(1);
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(rest)) {
    return `#${rest}`;
  }
  return rest;
}
