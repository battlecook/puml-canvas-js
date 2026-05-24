import type {
  ClassAst,
  ClassDecl,
  ClassKind,
  ClassMember,
  EnumConstant,
  Visibility,
} from '../../ast/class.js';
import {
  BODY_CLOSE,
  BODY_OPEN,
  CLASS_DECL,
  ENUM_CONSTANT,
  MEMBER_FIELD,
  MEMBER_METHOD,
  MEMBER_MODIFIER,
  MEMBER_VISIBILITY,
  NOTE_AS_BLOCK,
  NOTE_END,
  NOTE_FLOATING,
  NOTE_OF_BLOCK,
  NOTE_OF_INLINE,
  extractName,
} from './patterns.js';
import { parseRelationship } from './relationships.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

interface BodyContext {
  decl: ClassDecl;
}

export function parseClass(source: string): ClassAst {
  const ast: ClassAst = { kind: 'class', title: '', classes: [], relationships: [] };
  const byId = new Map<string, ClassDecl>();
  const noteIds = new Set<string>();
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

    const inline = /^(.+?)\s*\{(.+)\}\s*$/.exec(text);
    if (inline) {
      const m = CLASS_DECL.exec(inline[1]!.trim());
      if (m) {
        const decl = makeDecl(m);
        const stored = upsert(decl);
        for (const part of inline[2]!.split(/;|\n/)) {
          const t = part.trim();
          if (t) parseMemberInto(t, stored);
        }
        continue;
      }
    }

    const m = CLASS_DECL.exec(text);
    if (m) {
      const decl = makeDecl(m);
      const stored = upsert(decl);
      if (m[6]) body = { decl: stored };
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
  const kindToken = m[1]!.toLowerCase().replace(/\s+/g, ' ');
  const classKind = mapKind(kindToken);
  const name = extractName(m[2], m[3]);
  const alias = m[4];
  const stereotype = (m[5] ?? '').trim();
  const id = alias ?? name;
  return {
    id,
    name,
    classKind,
    stereotype,
    members: [],
    enumConstants: [],
  };
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
