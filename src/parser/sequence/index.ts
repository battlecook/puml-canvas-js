import type {
  ActivateStmt,
  AutoNumberStmt,
  DeactivateStmt,
  DividerStmt,
  GroupElseStmt,
  GroupEndStmt,
  GroupKind,
  GroupStartStmt,
  MessageStmt,
  NotePosition,
  NoteStmt,
  Participant,
  ParticipantShape,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import {
  ACTIVATE,
  AUTONUMBER,
  DEACTIVATE,
  DIVIDER,
  GROUP_ELSE,
  GROUP_END,
  GROUP_START,
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

export function parseSequence(source: string): SequenceAst {
  const ast: SequenceAst = { kind: 'sequence', title: '', participants: [], statements: [] };
  const declared = new Map<string, Participant>();
  const lines = source.split(/\r\n|\r|\n/);
  let pendingNote: PendingNote | null = null;

  const addParticipant = (p: Participant): void => {
    if (declared.has(p.id)) return;
    declared.set(p.id, p);
    ast.participants.push(p);
  };

  for (const raw of lines) {
    const text = raw.trim();

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

    const stmt = parseStatement(text, addParticipant, (note) => {
      pendingNote = note;
    });
    if (stmt) ast.statements.push(stmt);
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
): SequenceStatement | null {
  let m: RegExpExecArray | null;

  if ((m = PARTICIPANT.exec(text))) {
    const shape = m[1]!.toLowerCase() as ParticipantShape;
    const label = extractName(m[2], m[3]);
    const id = m[4] ?? label;
    addParticipant({ id, label, shape });
    return null;
  }

  if ((m = AUTONUMBER.exec(text))) {
    const stmt: AutoNumberStmt = {
      type: 'autonumber',
      start: m[1] ? Number(m[1]) : 1,
      step: m[2] ? Number(m[2]) : 1,
    };
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
    const stmt: NoteStmt = {
      type: 'note',
      position: m[1]!.toLowerCase() as NotePosition,
      targets: [extractName(m[2], m[3])],
      text: (m[4] ?? '').trim(),
    };
    return stmt;
  }

  if ((m = NOTE_SIDE_BLOCK.exec(text))) {
    setPendingNote({
      position: m[1]!.toLowerCase() as NotePosition,
      targets: [extractName(m[2], m[3])],
      buffer: [],
    });
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
    const txt = (m[6] ?? '').trim();
    const reverse = arrow.startsWith('<');
    const dashed = arrow.includes('--');
    const stmt: MessageStmt = {
      type: 'message',
      from: reverse ? right : left,
      to: reverse ? left : right,
      text: txt,
      style: dashed ? 'dashed' : 'solid',
      reverse,
    };
    return stmt;
  }

  return null;
}
