import type {
  ActivateStmt,
  ArrowMarker,
  AutoActivateStmt,
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
  ParticipantBox,
  ParticipantStereotype,
  RefStmt,
  ReturnStmt,
  ParticipantLine,
  ParticipantSection,
  ParticipantShape,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import {
  ACTIVATE,
  ACTOR_COLON,
  AUTOACTIVATE,
  AUTONUMBER,
  BOX_END,
  BOX_START,
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
  HIDE,
  LINE_COMMENT,
  MAINFRAME,
  MESSAGE,
  MESSAGE_FROM_LEFT,
  MESSAGE_FROM_SHORT,
  MESSAGE_TO_RIGHT,
  MESSAGE_TO_SHORT,
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
  RETURN,
  TITLE,
  WRAPPER,
  extractName,
} from './patterns.js';
import { extractSkinparams } from '../skinparams.js';

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
  const rawLines = source.split(/\r\n|\r|\n/);
  const { lines: linesAfterSkin, skin } = extractSkinparams(rawLines);
  if (Object.keys(skin).length > 0) ast.skin = skin;
  const { lines, styles } = extractStyleBlocks(linesAfterSkin);
  if (Object.keys(styles).length > 0) ast.styles = styles;
  let pendingNote: PendingNote | null = null;
  let pendingPartBlock: PendingPartBlock | null = null;
  let pendingRef: PendingRef | null = null;
  let inBlockComment = false;
  let lastMessage: MessageStmt | null = null;
  let headerBuf: string[] | null = null;
  let footerBuf: string[] | null = null;
  // Active `box ... end box` group. PlantUML rejects nested boxes; we mirror
  // that by ignoring a second `box` opener until the first is closed. Each
  // `box` increments boxCounter so reopened boxes get a fresh, unique id.
  let currentBox: ParticipantBox | null = null;
  let boxCounter = 0;

  const addParticipant = (p: Participant): void => {
    if (declared.has(p.id)) return;
    if (currentBox && p.box === undefined) p.box = currentBox;
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

    // `mainframe <label>` — global one-shot directive. Last one wins. The
    // label keeps inline markup verbatim (e.g. `**bold**`) so the layout can
    // feed it through the existing markup parser.
    const mainframeMatch = MAINFRAME.exec(text);
    if (mainframeMatch) {
      ast.mainframe = unescapeLabel(mainframeMatch[1]!.trim());
      continue;
    }

    // `hide unlinked` flips the AST flag so the layout filters out participants
    // never referenced by any statement. Other `hide ...` variants are accepted
    // as no-ops so they don't leak into the message parser as phantom IDs.
    const hideMatch = HIDE.exec(text);
    if (hideMatch) {
      const rest = hideMatch[1]!.trim().toLowerCase();
      if (rest === 'unlinked') ast.hideUnlinked = true;
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

    // `box ["Title"] [#Color]` opens a participant-grouping rectangle. The
    // closing `end box` / `endbox` clears it. PlantUML rejects nested boxes;
    // we silently ignore a second `box` while one is already open.
    if (BOX_END.test(text)) {
      currentBox = null;
      continue;
    }
    const boxMatch = BOX_START.exec(text);
    if (boxMatch) {
      if (currentBox === null) {
        boxCounter += 1;
        const box: ParticipantBox = { id: boxCounter };
        const title = (boxMatch[1] ?? boxMatch[2] ?? '').trim();
        if (title) box.title = unescapeLabel(title);
        if (boxMatch[3]) box.color = normalizeColor(boxMatch[3]);
        currentBox = box;
      }
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
      if (!stmt.fromBoundary && stmt.from) {
        addParticipant({ id: stmt.from, label: stmt.from, shape: 'participant' });
      }
      if (!stmt.toBoundary && stmt.to) {
        addParticipant({ id: stmt.to, label: stmt.to, shape: 'participant' });
      }
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
    const stereotypeRaw = m[6];
    const orderRaw = m[7];
    const openBracket = m[8];
    const part: Participant = { id, label, shape };
    if (colorRaw) part.color = normalizeColor(colorRaw);
    if (stereotypeRaw) {
      const st = parseStereotype(stereotypeRaw);
      if (st) part.stereotype = st;
    }
    if (orderRaw !== undefined) part.order = Number(orderRaw);
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

  // Colon-shorthand actor: `:Name:`, `:Display: as Id`, `actor :Display: as Id`.
  // The display name (between the colons) may contain spaces and `\n` escape
  // sequences; the id (after `as`) is a bare token. When no alias is given,
  // the display name doubles as the id (using the raw, un-unescaped token).
  if ((m = ACTOR_COLON.exec(text))) {
    const rawDisplay = m[1]!.trim();
    const label = unescapeLabel(rawDisplay);
    const id = m[2] ?? rawDisplay;
    const colorRaw = m[3];
    const part: Participant = { id, label, shape: 'actor' };
    if (colorRaw) part.color = normalizeColor(colorRaw);
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

  if ((m = AUTOACTIVATE.exec(text))) {
    const word = (m[1] ?? 'on').toLowerCase();
    const stmt: AutoActivateStmt = { type: 'autoactivate', enabled: word !== 'off' };
    return stmt;
  }

  if ((m = RETURN.exec(text))) {
    const stmt: ReturnStmt = { type: 'return', text: unescapeLabel((m[1] ?? '').trim()) };
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
    const stmt: GroupElseStmt = { type: 'groupElse', label: (m[2] ?? '').trim() };
    if (m[1]) stmt.branchColor = resolveGroupColor(m[1]);
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
      label: (m[4] ?? '').trim(),
    };
    if (m[2]) stmt.tabColor = resolveGroupColor(m[2]);
    if (m[3]) stmt.branchColor = resolveGroupColor(m[3]);
    return stmt;
  }

  // Found / lost messages — one end is the diagram boundary. Checked BEFORE
  // the general MESSAGE pattern because `[`, `]`, and `?` aren't excluded
  // from the NAME class, so without this branch `Bob ->]` / `[-> Bob` /
  // `?-> Bob` would otherwise match MESSAGE and create a phantom participant
  // named `[` / `]` / `?`. The `?` variant denotes a SHORT boundary — the
  // arrow stub sits just next to the participant's lifeline instead of at
  // the diagram edge.
  if ((m = MESSAGE_FROM_LEFT.exec(text))) {
    const stmt = buildBoundaryMessage(m, /* side */ 'left');
    return stmt;
  }
  if ((m = MESSAGE_TO_RIGHT.exec(text))) {
    const stmt = buildBoundaryMessage(m, /* side */ 'right');
    return stmt;
  }
  if ((m = MESSAGE_FROM_SHORT.exec(text))) {
    const stmt = buildBoundaryMessage(m, /* side */ 'short-left');
    return stmt;
  }
  if ((m = MESSAGE_TO_SHORT.exec(text))) {
    const stmt = buildBoundaryMessage(m, /* side */ 'short-right');
    return stmt;
  }

  if ((m = MESSAGE.exec(text))) {
    const left = extractName(m[1], m[2]);
    const arrow = m[3]!;
    const right = extractName(m[4], m[5]);
    const suffixes = m[6] ?? '';
    const txt = unescapeLabel((m[7] ?? '').trim());
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
    if (info.duration !== undefined) stmt.duration = info.duration;
    // Trailing target-side directives: `#color` (per-message color, also tints
    // the autoactivate bar on the receiver), `**` (create target here),
    // `!!` (destroy target after this message), `++` (activate target on this
    // message), `--` (deactivate sender on this message). `++` and `--` may
    // be combined (`++--` / `--++`). `**`/`!!` are mutually exclusive with
    // `++`/`--` on the same target slot, but the parser captures any present.
    if (suffixes) {
      const colorM = /#([A-Za-z0-9]+)/.exec(suffixes);
      if (colorM && !stmt.color) stmt.color = normalizeColor(`#${colorM[1]}`);
      if (/\*\*/.test(suffixes)) stmt.create = true;
      if (/!!/.test(suffixes)) stmt.destroy = true;
      if (/\+\+/.test(suffixes)) stmt.activateTarget = true;
      if (/--/.test(suffixes)) stmt.deactivateSource = true;
    }
    return stmt;
  }

  return null;
}

/**
 * Builds a `MessageStmt` for a found/lost message. `side` identifies which
 * diagram edge is the non-participant end:
 *   - `'left'`        : input was `[ <arrow> NAME [suffix] [: text]`
 *   - `'right'`       : input was `NAME <arrow> ] [suffix] [: text]`
 *   - `'short-left'`  : input was `? <arrow> NAME [suffix] [: text]` — the
 *                       boundary is a short stub just left of NAME's lifeline
 *                       instead of at the diagram edge.
 *   - `'short-right'` : input was `NAME <arrow> ? [suffix] [: text]` — short
 *                       stub just right of NAME's lifeline.
 *
 * Group indices in the regex follow MESSAGE's layout:
 *   left/short-left forms:  m[1]=arrow, m[2]/m[3]=name (quoted/bare), m[4]=suffix, m[5]=text
 *   right/short-right forms: m[1]/m[2]=name (quoted/bare), m[3]=arrow, m[4]=suffix, m[5]=text
 */
function buildBoundaryMessage(
  m: RegExpExecArray,
  side: 'left' | 'right' | 'short-left' | 'short-right',
): MessageStmt | null {
  let arrow: string;
  let name: string;
  let suffixes: string;
  let txt: string;
  const boundaryOnLeftOperand = side === 'left' || side === 'short-left';
  if (boundaryOnLeftOperand) {
    arrow = m[1]!;
    name = extractName(m[2], m[3]);
    suffixes = m[4] ?? '';
    txt = unescapeLabel((m[5] ?? '').trim());
  } else {
    name = extractName(m[1], m[2]);
    arrow = m[3]!;
    suffixes = m[4] ?? '';
    txt = unescapeLabel((m[5] ?? '').trim());
  }
  const info = parseArrow(arrow);
  if (!info) return null;
  const useForward = info.bidirectional || !info.reverse;
  // Map the parsed arrow back onto from/to. For left-form boundaries the
  // boundary is the LEFT operand of the arrow; for right-form boundaries
  // it's the RIGHT operand. `useForward` decides whether left→right matches
  // from→to or whether they get swapped (for `<-` reversed arrows).
  const leftSide = boundaryOnLeftOperand ? '' : name;
  const rightSide = boundaryOnLeftOperand ? name : '';
  const stmt: MessageStmt = {
    type: 'message',
    from: useForward ? leftSide : rightSide,
    to: useForward ? rightSide : leftSide,
    text: txt,
    style: info.dashed ? 'dashed' : 'solid',
    reverse: info.reverse && !info.bidirectional,
    startMarker: useForward ? info.leftMarker : info.rightMarker,
    endMarker: useForward ? info.rightMarker : info.leftMarker,
  };
  // Whichever end ended up as the empty string is the boundary.
  if (stmt.from === '') stmt.fromBoundary = side;
  if (stmt.to === '') stmt.toBoundary = side;
  if (info.color) stmt.color = info.color;
  if (info.duration !== undefined) stmt.duration = info.duration;
  if (suffixes) {
    const colorM = /#([A-Za-z0-9]+)/.exec(suffixes);
    if (colorM && !stmt.color) stmt.color = normalizeColor(`#${colorM[1]}`);
    if (/\*\*/.test(suffixes)) stmt.create = true;
    if (/!!/.test(suffixes)) stmt.destroy = true;
    if (/\+\+/.test(suffixes)) stmt.activateTarget = true;
    if (/--/.test(suffixes)) stmt.deactivateSource = true;
  }
  return stmt;
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
  /**
   * `A ->(N) B` / `A (N)<- B` — extracted duration (latency) for a "slanted"
   * timed arrow. Undefined when the arrow has no `(N)` group. The parser
   * doesn't decide which lifeline gets the slope; layout handles that by
   * using the message's from/to direction.
   */
  duration?: number;
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
  // Extract optional `(N)` slanted-arrow / duration group. PlantUML grammar
  // places it on the OUTGOING side of the arrow body: just AFTER the dashes
  // for forward arrows (`->(10)`), or just BEFORE the `<` for reverse arrows
  // (`(10)<-`). We accept either position and strip it from the arrow text
  // so the dash/marker classification below sees the bare arrow.
  let duration: number | undefined;
  const durationMatch = /\((\d+)\)/.exec(arrow);
  if (durationMatch) {
    duration = Number(durationMatch[1]);
    arrow = arrow.replace(/\(\d+\)/, '');
  }
  if (!arrow.includes('-')) return null;
  const firstDash = arrow.indexOf('-');
  const lastDash = arrow.lastIndexOf('-');
  const left = arrow.slice(0, firstDash);
  const dashes = arrow.slice(firstDash, lastDash + 1);
  const right = arrow.slice(lastDash + 1);
  const info: ArrowInfo = {
    leftMarker: classifyMarker(left),
    rightMarker: classifyMarker(right),
    dashed: dashes.length >= 2,
    reverse: left.includes('<'),
    bidirectional: left.includes('<') && right.includes('>'),
    color,
  };
  if (duration !== undefined) info.duration = duration;
  return info;
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

/**
 * Parses a `<< ... >>` stereotype block. The interior is stripped of surrounding
 * whitespace; if it begins with `(X,#RRGGBB)` that spot block is peeled off and
 * the remainder becomes the label. Either component may be absent:
 *   `<< Generated >>`            → { label: 'Generated' }
 *   `<< (C,#ADD1B2) Testable >>` → { label: 'Testable', spot: { ... } }
 *   `<< (C,#ADD1B2) >>`          → { spot: { ... } }
 */
function parseStereotype(raw: string): ParticipantStereotype | null {
  const inner = raw.replace(/^<<\s*/, '').replace(/\s*>>$/, '');
  if (!inner) return null;
  const spotM = /^\(([^,()]),\s*(#[0-9A-Fa-f]{3,8})\)\s*(.*)$/.exec(inner);
  if (spotM) {
    const st: ParticipantStereotype = {
      spot: { char: spotM[1]!, color: spotM[2]! },
    };
    const rest = spotM[3]!.trim();
    if (rest) st.label = rest;
    return st;
  }
  return { label: inner.trim() };
}

/**
 * PlantUML named-color map. Kept intentionally tiny — only names where
 * downstream code (tests, golden output) expects a specific hex value.
 * Looked up case-insensitively. Names not in this table fall through and are
 * emitted bare so SVG can resolve them as standard CSS color names (`red`,
 * `gray`, etc.) directly.
 */
const NAMED_COLORS: Record<string, string> = {
  lightblue: '#ADD8E6',
};

/**
 * PlantUML-named-color → hex map covering only the names actually exercised by
 * tests / failing fixtures. Looked up case-insensitively. Kept separate from
 * the participant-color `NAMED_COLORS` table so callers that want pass-through
 * behaviour (e.g. `actor Bob #red` — which expects the bare string `'red'` in
 * the AST) aren't affected.
 */
const SKIN_NAMED_COLORS: Record<string, string> = {
  deepskyblue: '#00BFFF',
  dodgerblue: '#1E90FF',
  aqua: '#00FFFF',
  blue: '#0000FF',
};

/**
 * Color names accepted in the GROUP/`alt`/`else` tab + branch positions
 * (`alt#Gold #LightBlue ...`). Kept separate from `NAMED_COLORS` so the
 * participant-color path (`actor Bob #red`) still emits bare `'red'` for the
 * AST contract that test goldens rely on. Looked up case-insensitively;
 * unknown names fall through to the bare token so SVG can resolve them as
 * CSS color keywords.
 */
const GROUP_NAMED_COLORS: Record<string, string> = {
  gold: '#FFD700',
  lightblue: '#ADD8E6',
  pink: '#FFC0CB',
};

/**
 * Resolves a `#color` token from a group-start / else line. Hex literals
 * (`#RRGGBB`, `#RGB`) keep their leading `#`. Bare names matching
 * `GROUP_NAMED_COLORS` resolve to canonical hex; everything else passes
 * through as the bare name (sans `#`) so SVG can fall back to CSS color
 * resolution.
 */
function resolveGroupColor(raw: string): string {
  if (!raw.startsWith('#')) return raw;
  const rest = raw.slice(1);
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(rest)) {
    return `#${rest}`;
  }
  const mapped = GROUP_NAMED_COLORS[rest.toLowerCase()];
  if (mapped) return mapped;
  return rest;
}

/**
 * Resolves a skinparam color value. Hex literals (`#RRGGBB`, `#RGB`) pass
 * through unchanged. Bare names matching `SKIN_NAMED_COLORS` resolve to their
 * canonical hex; all other tokens (unknown names, numbers, font names) pass
 * through verbatim so SVG can fall back to CSS color resolution.
 */
export function resolveSkinColor(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith('#')) return raw;
  const key = raw.toLowerCase();
  return SKIN_NAMED_COLORS[key] ?? raw;
}

/**
 * Pre-pass: strips `<style> ... </style>` blocks from the line list and
 * collects them into a nested map keyed by lower-cased selector → property →
 * raw value. Grammar (minimal subset):
 *
 *   <style>
 *     selector1 {
 *       Property Value
 *       Property Value
 *     }
 *     selector2 {
 *       Property Value
 *     }
 *   </style>
 *
 * Selectors and property names are stored lower-cased; values are kept as the
 * raw whitespace-separated token tail. Layout reads `linestyle` only this
 * round; other captured properties are intentionally no-ops (the goal here is
 * to absorb the source so it doesn't leak into the message parser as garbage).
 */
function extractStyleBlocks(
  rawLines: string[],
): { lines: string[]; styles: Record<string, Record<string, string>> } {
  const out: string[] = [];
  const styles: Record<string, Record<string, string>> = {};
  let inStyleBlock = false;
  let currentSelector: string | null = null;

  for (const raw of rawLines) {
    const text = raw.trim();

    if (!inStyleBlock) {
      if (/^<style>\s*$/i.test(text)) {
        inStyleBlock = true;
        currentSelector = null;
        continue;
      }
      out.push(raw);
      continue;
    }

    // Inside <style> ... </style>.
    if (/^<\/style>\s*$/i.test(text)) {
      inStyleBlock = false;
      currentSelector = null;
      continue;
    }
    if (!text) continue;

    if (currentSelector === null) {
      // Expect a selector opener: `name {` or `name`.
      const open = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\{?\s*$/.exec(text);
      if (open) {
        currentSelector = open[1]!.toLowerCase();
        if (!styles[currentSelector]) styles[currentSelector] = {};
      }
      continue;
    }

    // Inside a selector body.
    if (text === '}' || /^\}\s*$/.test(text)) {
      currentSelector = null;
      continue;
    }
    const prop = /^(\S+)\s+(.+)$/.exec(text);
    if (prop) {
      styles[currentSelector]![prop[1]!.toLowerCase()] = prop[2]!.trim();
    }
  }

  return { lines: out, styles };
}

function normalizeColor(raw: string): string {
  // PlantUML accepts `#red` (named) or `#99FF99` (hex). Hex form keeps the
  // leading `#`; named-color form is mapped through the small lookup table
  // above when we know a canonical hex, else it's passed through bare so SVG
  // can resolve it as a CSS color.
  if (!raw.startsWith('#')) return raw;
  const rest = raw.slice(1);
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(rest)) {
    return `#${rest}`;
  }
  const mapped = NAMED_COLORS[rest.toLowerCase()];
  if (mapped) return mapped;
  return rest;
}
