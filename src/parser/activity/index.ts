import type {
  ActionNode,
  ActivityAst,
  ActivityNode,
  ForkNode,
  IfBranch,
  IfNode,
  PartitionNode,
  RepeatNode,
  WhileNode,
} from '../../ast/activity.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const ACTION = /^:(.+);$/;
// Extension: `- Some text` lines are treated as action steps, equivalent to
// `:Some text;`. PlantUML本家 doesn't document this but several PlantUML-compatible
// viewers accept it as a markdown-style shortcut and render a sequential flow.
const DASH_ACTION = /^-\s+(.+?)\s*$/;
// Extension: `* Some text` (or `** Some text`, `*** Some text`, …) bullet lines
// are treated the same way — equivalent to `:Some text;`. The leading star
// count determines the nesting level: `*` is depth 1, `**` is depth 2, etc.
// Children are attached to the most recent parent at one level shallower via
// an explicit parent-stack pass after the regular sequential parse.
const STAR_ACTION = /^(\*+)\s+(.+?)\s*$/;
const IF = /^if\s*\((.*?)\)\s*then(?:\s*\((.*?)\))?\s*$/i;
const ELSEIF = /^elseif\s*\((.*?)\)\s*then(?:\s*\((.*?)\))?\s*$/i;
const ELSE = /^else(?:\s*\((.*?)\))?\s*$/i;
const ENDIF = /^endif\s*$/i;
const WHILE = /^while\s*\((.*?)\)(?:\s*is\s*\((.*?)\))?\s*$/i;
const ENDWHILE = /^endwhile(?:\s*\((.*?)\))?\s*$/i;
const REPEAT = /^repeat\s*$/i;
const REPEAT_WHILE = /^repeat\s+while\s*\((.*?)\)(?:\s*is\s*\((.*?)\))?(?:\s+not\s*\((.*?)\))?\s*$/i;
const FORK = /^fork\s*$/i;
const FORK_AGAIN = /^fork\s+again\s*$/i;
const END_FORK = /^end\s+fork\s*$/i;
const END_MERGE = /^end\s+merge\s*$/i;
const START = /^start\s*$/i;
const STOP = /^stop\s*$/i;
const END_NODE = /^end\s*$/i;
const DETACH = /^detach\s*$/i;
const KILL = /^kill\s*$/i;
const BREAK = /^break\s*$/i;
const PARTITION_OPEN = /^partition\s+(?:"([^"]+)"|(\S+))\s*\{?\s*$/i;
const BLOCK_CLOSE = /^\}\s*$/;

export function parseActivity(source: string): ActivityAst {
  const ast: ActivityAst = { kind: 'activity', title: '', body: [] };
  const rawLines = source.split(/\r\n|\r|\n/);
  const { lines: afterStyle, styles } = extractStyleBlocks(rawLines);
  if (Object.keys(styles).length > 0) ast.styles = styles;

  const lines: string[] = [];
  for (const raw of afterStyle) {
    const t = raw.trim();
    if (!t) continue;
    if (LINE_COMMENT.test(t)) continue;
    if (WRAPPER.test(t)) continue;
    const tm = TITLE.exec(t);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }
    lines.push(t);
  }

  const ctx = { lines, i: 0 };
  ast.body = parseStatements(ctx, isTerminator);
  return ast;
}

/**
 * Pre-pass that lifts `<style> selector { Property Value ... } </style>` blocks
 * out of the source. Mirrors the sequence-diagram implementation in
 * `src/parser/sequence/index.ts`. Selectors and property names are stored
 * lower-cased; values keep their raw whitespace-separated tail. Layout reads
 * `element.minimumwidth` this round; other captured properties are no-ops.
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

    if (/^<\/style>\s*$/i.test(text)) {
      inStyleBlock = false;
      currentSelector = null;
      continue;
    }
    if (!text) continue;

    if (currentSelector === null) {
      // Single-line form: `selector {Property Value}` — closed on same line.
      const oneLine = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\{\s*(\S+)\s+(.+?)\s*\}\s*$/.exec(text);
      if (oneLine) {
        const sel = oneLine[1]!.toLowerCase();
        if (!styles[sel]) styles[sel] = {};
        styles[sel]![oneLine[2]!.toLowerCase()] = oneLine[3]!.trim();
        continue;
      }
      const open = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\{?\s*$/.exec(text);
      if (open) {
        currentSelector = open[1]!.toLowerCase();
        if (!styles[currentSelector]) styles[currentSelector] = {};
      }
      continue;
    }

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

interface Ctx {
  lines: string[];
  i: number;
}

function isTerminator(text: string): boolean {
  return (
    ENDIF.test(text) ||
    ELSE.test(text) ||
    ELSEIF.test(text) ||
    ENDWHILE.test(text) ||
    REPEAT_WHILE.test(text) ||
    END_FORK.test(text) ||
    END_MERGE.test(text) ||
    FORK_AGAIN.test(text) ||
    BLOCK_CLOSE.test(text)
  );
}

function parseStatements(ctx: Ctx, stop: (text: string) => boolean): ActivityNode[] {
  const out: ActivityNode[] = [];
  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]!;
    if (stop(line)) break;
    const node = parseStatement(ctx);
    if (node) out.push(node);
  }
  return out;
}

function parseStatement(ctx: Ctx): ActivityNode | null {
  const line = ctx.lines[ctx.i]!;

  if (START.test(line)) {
    ctx.i++;
    return { type: 'start' };
  }
  if (STOP.test(line)) {
    ctx.i++;
    return { type: 'stop' };
  }
  if (DETACH.test(line)) {
    ctx.i++;
    return { type: 'detach' };
  }
  if (KILL.test(line)) {
    ctx.i++;
    return { type: 'kill' };
  }
  if (BREAK.test(line)) {
    ctx.i++;
    return { type: 'break' };
  }
  if (PARTITION_OPEN.test(line)) return parsePartition(ctx);
  if (IF.test(line)) return parseIf(ctx);
  if (WHILE.test(line)) return parseWhile(ctx);
  if (REPEAT.test(line) && !REPEAT_WHILE.test(line)) return parseRepeat(ctx);
  if (FORK.test(line)) return parseFork(ctx);

  const am = ACTION.exec(line);
  if (am) {
    ctx.i++;
    return { type: 'action', text: am[1]!.trim() };
  }

  const dm = DASH_ACTION.exec(line);
  if (dm) {
    ctx.i++;
    return { type: 'action', text: dm[1]!.trim() };
  }

  const sm = STAR_ACTION.exec(line);
  if (sm) {
    return parseBulletAction(ctx, sm[1]!.length);
  }

  if (END_NODE.test(line)) {
    ctx.i++;
    return { type: 'end' };
  }

  ctx.i++;
  return null;
}

function parseIf(ctx: Ctx): IfNode {
  const m = IF.exec(ctx.lines[ctx.i]!)!;
  const condition = m[1]!.trim();
  const firstLabel = (m[2] ?? '').trim();
  ctx.i++;

  const branches: IfBranch[] = [];
  const firstBody = parseStatements(ctx, isTerminator);
  branches.push({ label: firstLabel, body: firstBody });

  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]!;
    if (ELSEIF.test(line)) {
      const em = ELSEIF.exec(line)!;
      ctx.i++;
      const body = parseStatements(ctx, isTerminator);
      branches.push({ label: `${em[2] ?? ''}|${em[1] ?? ''}`, body });
      continue;
    }
    break;
  }

  let elseBranch: IfBranch | null = null;
  if (ctx.i < ctx.lines.length && ELSE.test(ctx.lines[ctx.i]!)) {
    const em = ELSE.exec(ctx.lines[ctx.i]!)!;
    ctx.i++;
    const body = parseStatements(ctx, isTerminator);
    elseBranch = { label: (em[1] ?? '').trim(), body };
  }

  if (ctx.i < ctx.lines.length && ENDIF.test(ctx.lines[ctx.i]!)) {
    ctx.i++;
  }

  return { type: 'if', condition, branches, elseBranch };
}

function parseWhile(ctx: Ctx): WhileNode {
  const m = WHILE.exec(ctx.lines[ctx.i]!)!;
  const condition = m[1]!.trim();
  const yesLabel = (m[2] ?? '').trim();
  ctx.i++;
  const body = parseStatements(ctx, isTerminator);
  let noLabel = '';
  if (ctx.i < ctx.lines.length && ENDWHILE.test(ctx.lines[ctx.i]!)) {
    const em = ENDWHILE.exec(ctx.lines[ctx.i]!)!;
    noLabel = (em[1] ?? '').trim();
    ctx.i++;
  }
  return { type: 'while', condition, yesLabel, noLabel, body };
}

function parseRepeat(ctx: Ctx): RepeatNode {
  ctx.i++;
  const body = parseStatements(ctx, isTerminator);
  let condition = '';
  let yesLabel = '';
  let noLabel = '';
  if (ctx.i < ctx.lines.length && REPEAT_WHILE.test(ctx.lines[ctx.i]!)) {
    const m = REPEAT_WHILE.exec(ctx.lines[ctx.i]!)!;
    condition = m[1]!.trim();
    yesLabel = (m[2] ?? '').trim();
    noLabel = (m[3] ?? '').trim();
    ctx.i++;
  }
  return { type: 'repeat', body, condition, yesLabel, noLabel };
}

function parsePartition(ctx: Ctx): PartitionNode {
  const m = PARTITION_OPEN.exec(ctx.lines[ctx.i]!)!;
  const name = (m[1] ?? m[2] ?? '').trim();
  ctx.i++;
  const body = parseStatements(ctx, isTerminator);
  if (ctx.i < ctx.lines.length && BLOCK_CLOSE.test(ctx.lines[ctx.i]!)) {
    ctx.i++;
  }
  return { type: 'partition', name, body };
}

/**
 * Consumes the current bullet-list line at the given star `depth` and
 * recursively attaches subsequent bullets whose depth is strictly greater as
 * its `children`. Bullets at the same depth (siblings) are left for the outer
 * `parseStatements` loop to pick up as separate top-level entries. Bullets
 * with depth gaps (e.g. `*` followed by `***`) still nest — any depth > parent
 * counts as a descendant of the parent.
 */
function parseBulletAction(ctx: Ctx, depth: number): ActionNode {
  const sm = STAR_ACTION.exec(ctx.lines[ctx.i]!)!;
  ctx.i++;
  const node: ActionNode = { type: 'action', text: sm[2]!.trim() };
  const children: ActionNode[] = [];
  while (ctx.i < ctx.lines.length) {
    const next = STAR_ACTION.exec(ctx.lines[ctx.i]!);
    if (!next) break;
    const nextDepth = next[1]!.length;
    if (nextDepth <= depth) break;
    children.push(parseBulletAction(ctx, nextDepth));
  }
  if (children.length > 0) node.children = children;
  return node;
}

function parseFork(ctx: Ctx): ForkNode {
  ctx.i++;
  const branches: ActivityNode[][] = [];
  branches.push(parseStatements(ctx, isTerminator));
  while (ctx.i < ctx.lines.length && FORK_AGAIN.test(ctx.lines[ctx.i]!)) {
    ctx.i++;
    branches.push(parseStatements(ctx, isTerminator));
  }
  let merge = true;
  if (ctx.i < ctx.lines.length) {
    if (END_MERGE.test(ctx.lines[ctx.i]!)) {
      merge = true;
      ctx.i++;
    } else if (END_FORK.test(ctx.lines[ctx.i]!)) {
      merge = false;
      ctx.i++;
    }
  }
  return { type: 'fork', branches, merge };
}
