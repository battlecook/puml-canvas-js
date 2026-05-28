import type {
  ClassAst,
  ClassDecl,
  ClassKind,
  ClassMember,
  ClassRelationship,
  EnumConstant,
  Visibility,
} from '../../ast/class.js';
import {
  BODY_CLOSE,
  BODY_OPEN,
  CLASS_DECL,
  DIRECTION_LR,
  DIRECTION_TB,
  ENUM_CONSTANT,
  LEADING_TAG,
  MEMBER_FIELD,
  MEMBER_METHOD,
  MEMBER_MODIFIER,
  MEMBER_VISIBILITY,
  NOTE_AS_BLOCK,
  NOTE_END,
  NOTE_FLOATING,
  NOTE_OF_BLOCK,
  NOTE_OF_INLINE,
  REMOVE_STMT,
  extractName,
} from './patterns.js';
import { parseRelationship } from './relationships.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;
const HIDE_EMPTY_MEMBERS = /^hide\s+empty\s+members\s*$/i;

interface BodyContext {
  decl: ClassDecl;
}

export function parseClass(source: string): ClassAst {
  const ast: ClassAst = {
    kind: 'class',
    title: '',
    classes: [],
    relationships: [],
    hideEmptyMembers: false,
  };
  const byId = new Map<string, ClassDecl>();
  const noteIds = new Set<string>();
  const removeIds = new Set<string>();
  const lines = source.split(/\r\n|\r|\n/);
  let body: BodyContext | null = null;
  let skipNoteBlock = false;

  const upsert = (decl: ClassDecl): ClassDecl => {
    const existing = byId.get(decl.id);
    if (existing) return existing;
    byId.set(decl.id, decl);
    ast.classes.push(decl);
    return decl;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const text = raw.trim();

    if (body) {
      if (BODY_CLOSE.test(text)) {
        body = null;
        continue;
      }
      if (!text) continue;
      if (LINE_COMMENT.test(text)) continue;
      parseMemberInto(text, body.decl);
      continue;
    }

    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    if (skipNoteBlock) {
      if (NOTE_END.test(text)) skipNoteBlock = false;
      continue;
    }

    const titleMatch = TITLE.exec(text);
    if (titleMatch) {
      ast.title = titleMatch[1]!.trim();
      continue;
    }

    if (HIDE_EMPTY_MEMBERS.test(text)) {
      ast.hideEmptyMembers = true;
      continue;
    }

    if (DIRECTION_LR.test(text)) {
      ast.direction = 'LR';
      continue;
    }
    if (DIRECTION_TB.test(text)) {
      ast.direction = 'TB';
      continue;
    }

    const rm = REMOVE_STMT.exec(text);
    if (rm) {
      removeIds.add(rm[1]!);
      continue;
    }

    let nm: RegExpExecArray | null;
    if ((nm = NOTE_FLOATING.exec(text))) {
      noteIds.add(nm[3]!);
      continue;
    }
    if (NOTE_OF_INLINE.test(text)) continue;
    if (NOTE_OF_BLOCK.test(text)) {
      skipNoteBlock = true;
      continue;
    }
    if ((nm = NOTE_AS_BLOCK.exec(text))) {
      noteIds.add(nm[1]!);
      skipNoteBlock = true;
      continue;
    }

    if (BODY_OPEN.test(text)) {
      const last = ast.classes[ast.classes.length - 1];
      if (last) body = { decl: last };
      continue;
    }

    // PlantUML accepts a leading tag-style attribute (e.g. `$C2`) before the
    // `class` keyword. Strip it; the tag itself is a no-op decorator here.
    const declText = text.replace(LEADING_TAG, '');

    const inline = /^(.+?)\s*\{(.+)\}\s*$/.exec(declText);
    if (inline) {
      const m = CLASS_DECL.exec(inline[1]!.trim());
      if (m) {
        const decl = makeDecl(m);
        const stored = upsert(decl);
        applyDeclTail(m[7], stored, ast, byId);
        for (const part of inline[2]!.split(/;|\n/)) {
          const t = part.trim();
          if (t) parseMemberInto(t, stored);
        }
        continue;
      }
    }

    const m = CLASS_DECL.exec(declText);
    if (m) {
      const decl = makeDecl(m);
      const stored = upsert(decl);
      applyDeclTail(m[7], stored, ast, byId);
      if (m[8]) body = { decl: stored };
      continue;
    }

    const rel = parseRelationship(text);
    if (rel) {
      if (noteIds.has(rel.source) || noteIds.has(rel.target)) {
        continue;
      }
      ast.relationships.push(rel);
      ensureClass(byId, ast, rel.source);
      ensureClass(byId, ast, rel.target);
      continue;
    }
  }

  // Apply `remove <name>` statements: drop matching classes and any
  // relationships that reference them. Unknown names are silently ignored.
  if (removeIds.size > 0) {
    ast.classes = ast.classes.filter((c) => !removeIds.has(c.id));
    ast.relationships = ast.relationships.filter(
      (r) => !removeIds.has(r.source) && !removeIds.has(r.target),
    );
  }

  return ast;
}

function ensureClass(byId: Map<string, ClassDecl>, ast: ClassAst, id: string): void {
  if (byId.has(id)) return;
  const decl: ClassDecl = {
    id,
    name: id,
    classKind: 'class',
    stereotype: '',
    members: [],
    enumConstants: [],
  };
  byId.set(id, decl);
  ast.classes.push(decl);
}

function makeDecl(m: RegExpExecArray): ClassDecl {
  // Capture groups (CLASS_DECL):
  //   1 = visibility marker (+/-/#/~) — optional, BEFORE the keyword
  //   2 = kind keyword (class/interface/…)
  //   3 = quoted display name
  //   4 = bare name
  //   5 = alias (after `as`)
  //   6 = stereotype body
  //   7 = trailing `{` (signals body opens on same line)
  const visToken = m[1];
  const kindToken = m[2]!.toLowerCase().replace(/\s+/g, ' ');
  const classKind = mapKind(kindToken);
  const name = extractName(m[3], m[4]);
  const alias = m[5];
  const stereotype = (m[6] ?? '').trim();
  const id = alias ?? name;
  const decl: ClassDecl = {
    id,
    name,
    classKind,
    stereotype,
    members: [],
    enumConstants: [],
  };
  if (visToken) decl.visibility = mapVisibility(visToken);
  return decl;
}

function mapKind(token: string): ClassKind {
  switch (token) {
    case 'abstract class': return 'abstract';
    case 'abstract':       return 'abstract';
    case 'interface':      return 'interface';
    case 'enum':           return 'enum';
    case 'annotation':     return 'annotation';
    case 'record':         return 'record';
    case 'class':
    default:               return 'class';
  }
}

function parseMemberInto(text: string, decl: ClassDecl): void {
  if (decl.classKind === 'enum') {
    const em = ENUM_CONSTANT.exec(text);
    if (em) {
      const ec: EnumConstant = { name: em[1]! };
      decl.enumConstants.push(ec);
      return;
    }
  }

  let rest = text;
  let isStatic = false;
  let isAbstract = false;

  const mod = MEMBER_MODIFIER.exec(rest);
  if (mod) {
    if (mod[1]!.toLowerCase() === 'static') isStatic = true;
    else isAbstract = true;
    rest = rest.slice(mod[0].length);
  }

  let visibility: Visibility = 'none';
  const vis = MEMBER_VISIBILITY.exec(rest);
  if (vis) {
    visibility = mapVisibility(vis[1]!);
    rest = rest.slice(vis[0].length);
  }

  const mm = MEMBER_METHOD.exec(rest);
  if (mm) {
    const member: ClassMember = {
      memberKind: 'method',
      visibility,
      name: mm[1]!,
      type: (mm[3] ?? '').trim(),
      params: mm[2]!.trim(),
      isStatic,
      isAbstract,
    };
    decl.members.push(member);
    return;
  }

  const mf = MEMBER_FIELD.exec(rest);
  if (mf) {
    const member: ClassMember = {
      memberKind: 'field',
      visibility,
      name: mf[1]!,
      type: (mf[2] ?? '').trim(),
      params: '',
      isStatic,
      isAbstract,
    };
    decl.members.push(member);
  }
}

function mapVisibility(c: string): Visibility {
  switch (c) {
    case '+': return 'public';
    case '-': return 'private';
    case '#': return 'protected';
    case '~': return 'package';
    default:  return 'none';
  }
}

/**
 * Parse the trailing "tail" of a class declaration captured by `CLASS_DECL`
 * group 7. The tail may contain (in either order, separated by whitespace):
 *   - An inline `#<styleBlock>` (`#back:red;line:00FFFF`, `#lightblue`, …).
 *   - One or more `extends NameList` / `implements NameList` clauses.
 *
 * Synthetic relationships are emitted for each parent named after `extends`
 * (`Parent <|-- This` — inheritance, solid) and `implements` (`Parent <|.. This`
 *  — realization, dashed). Parents not previously declared are auto-registered
 * as plain classes (matches PlantUML behavior).
 */
function applyDeclTail(
  tail: string | undefined,
  decl: ClassDecl,
  ast: ClassAst,
  byId: Map<string, ClassDecl>,
): void {
  if (!tail) return;
  let rest = tail.trim();
  if (!rest) return;

  // Pull the `#styleBlock` out first (may appear anywhere in the tail).
  const styleMatch = /(?:^|\s)#(\S+)/.exec(rest);
  if (styleMatch) {
    applyStyleBlock(styleMatch[1]!, decl);
    rest = (rest.slice(0, styleMatch.index) + rest.slice(styleMatch.index + styleMatch[0].length)).trim();
  }

  // Walk through any number of `(extends|implements) NameList` clauses.
  // PlantUML allows mixing: `class A extends B implements C, D` is valid.
  const clauseRe = /(extends|implements)\s+([A-Za-z_$][\w$.]*(?:\s*,\s*[A-Za-z_$][\w$.]*)*)/gi;
  let cm: RegExpExecArray | null;
  while ((cm = clauseRe.exec(rest)) !== null) {
    const keyword = cm[1]!.toLowerCase();
    const names = cm[2]!.split(',').map((n) => n.trim()).filter(Boolean);
    for (const parent of names) {
      ensureClass(byId, ast, parent);
      ast.relationships.push(makeSyntheticRelation(parent, decl.id, keyword === 'extends'));
    }
  }
}

function makeSyntheticRelation(parent: string, child: string, isExtends: boolean): ClassRelationship {
  // `extends`     → `Parent <|-- Child` (inheritance, solid).
  // `implements`  → `Parent <|.. Child` (realization, dashed).
  // The triangle sits on the parent (source) side.
  return {
    source: parent,
    target: child,
    sourceMult: '',
    targetMult: '',
    arrowToken: isExtends ? '<|--' : '<|..',
    kind: isExtends ? 'inheritance' : 'realization',
    style: isExtends ? 'solid' : 'dashed',
    sourceMarker: 'triangle',
    targetMarker: 'none',
    label: '',
    labelDirection: 'none',
  };
}

/**
 * Parse a `;`-separated inline style block (the text after `#` in a class
 * declaration) and set the matching style fields on the class declaration.
 */
function applyStyleBlock(block: string, decl: ClassDecl): void {
  for (const rawTok of block.split(';')) {
    const tok = rawTok.trim();
    if (!tok) continue;
    applyStyleToken(tok, decl);
  }
}

function applyStyleToken(tok: string, decl: ClassDecl): void {
  // `line.bold`, `line.dashed[:color]`, `line.dotted[:color]`
  const lineStyleMatch = /^line\.(bold|dashed|dotted)(?::(.+))?$/i.exec(tok);
  if (lineStyleMatch) {
    decl.borderStyle = lineStyleMatch[1]!.toLowerCase() as 'bold' | 'dashed' | 'dotted';
    const color = lineStyleMatch[2];
    if (color) decl.borderColor = normalizeColor(color);
    return;
  }

  // `line:<color>`
  const lineMatch = /^line:(.+)$/i.exec(tok);
  if (lineMatch) {
    decl.borderColor = normalizeColor(lineMatch[1]!);
    return;
  }

  // `back:<color>` (with optional `|<color2>` gradient stop)
  const backMatch = /^back:(.+)$/i.exec(tok);
  if (backMatch) {
    const value = backMatch[1]!;
    const parts = value.split('|');
    if (parts.length >= 2) {
      const c1 = normalizeColor(parts[0]!.trim());
      const c2 = normalizeColor(parts[1]!.trim());
      decl.fill = c1;
      decl.fillGradient = [c1, c2];
    } else {
      decl.fill = normalizeColor(value);
    }
    return;
  }

  // `header:<color>` or `header:<color>/<color>` (gradient)
  const headerMatch = /^header:(.+)$/i.exec(tok);
  if (headerMatch) {
    const value = headerMatch[1]!;
    const parts = value.split('/');
    if (parts.length >= 2) {
      const c1 = normalizeColor(parts[0]!.trim());
      const c2 = normalizeColor(parts[1]!.trim());
      decl.headerFill = c1;
      decl.headerGradient = [c1, c2];
    } else {
      decl.headerFill = normalizeColor(value);
    }
    return;
  }

  // Bare color (no `back:`/`line:` prefix) — treated as fill.
  decl.fill = normalizeColor(tok);
}

/**
 * Hex colors written without a leading `#` (e.g. `00FFFF`) are accepted by
 * PlantUML; we add the `#` so downstream SVG renderers don't misinterpret them.
 */
function normalizeColor(raw: string): string {
  const s = raw.trim();
  if (/^[0-9A-Fa-f]{3}$/.test(s) || /^[0-9A-Fa-f]{6}$/.test(s) || /^[0-9A-Fa-f]{8}$/.test(s)) {
    return '#' + s;
  }
  return s;
}
