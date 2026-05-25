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
  NoteStmt,
  Participant,
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
  NOTE_END,
  NOTE_OVER_BLOCK,
  NOTE_OVER_INLINE,
  NOTE_SIDE_BLOCK,
  NOTE_SIDE_INLINE,
  PARTICIPANT,
  TITLE,
  WRAPPER,
  extractName,
} from './patterns.js';

interface PendingNote {
  position: NotePosition;
  targets: [string] | [string, string];
  buffer: string[];
}

interface PendingPartBlock {
  participant: Participant;
  buffer: string[];
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

    if (pendingNote !== null) {
      const pn = pendingNote as PendingNote;
      if (NOTE_END.test(text)) {
        const noteStmt: NoteStmt = {
          type: 'note',
          position: pn.position,
          targets: pn.targets,
          text: pn.buffer.join('\n'),
        };
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
    }
  }

  return ast;
}

function parseStatement(
  text: string,
  addParticipant: (p: Participant) => void,
  setPendingNote: (n: PendingNote) => void,
  setPendingPartBlock: (b: PendingPartBlock) => void,
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
    const stmt: DividerStmt = { type: 'divider', label: m[1]!.trim() };
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

  if ((m = NOTE_SIDE_INLINE.exec(text))) {
    const pos = m[1]!.toLowerCase() as NotePosition;
    const explicit = extractName(m[2], m[3]);
    const target = explicit || sideNoteFallback(pos, lastMessage);
    if (!target) return null;
    const stmt: NoteStmt = {
      type: 'note',
      position: pos,
      targets: [target],
      text: (m[4] ?? '').trim(),
    };
    return stmt;
  }

  if ((m = NOTE_SIDE_BLOCK.exec(text))) {
    const pos = m[1]!.toLowerCase() as NotePosition;
    const explicit = extractName(m[2], m[3]);
    const target = explicit || sideNoteFallback(pos, lastMessage);
    if (!target) return null;
    setPendingNote({ position: pos, targets: [target], buffer: [] });
    return null;
  }

  if ((m = NOTE_OVER_INLINE.exec(text))) {
    const a = extractName(m[1], m[2]);
    const b = extractName(m[3], m[4]);
    const targets: [string] | [string, string] = b ? [a, b] : [a];
    const stmt: NoteStmt = { type: 'note', position: 'over', targets, text: (m[5] ?? '').trim() };
    return stmt;
  }

  if ((m = NOTE_OVER_BLOCK.exec(text))) {
    const a = extractName(m[1], m[2]);
    const b = extractName(m[3], m[4]);
    setPendingNote({
      position: 'over',
      targets: b ? [a, b] : [a],
      buffer: [],
    });
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
