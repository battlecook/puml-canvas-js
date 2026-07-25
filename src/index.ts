import { parse } from './parser/index.js';
import { layout } from './layout/index.js';
import { SvgRenderer } from './render/svg/index.js';
import { applyTheme, type Theme } from './render/theme.js';
import type { Scene } from './scene/types.js';
import type { DiagramAst } from './ast/index.js';
import {
  applyPreprocessorWarningBanner,
  detectUnsupportedDirectives,
} from './preprocessor-warnings.js';

export interface RenderOptions {
  document?: Document;
  /**
   * Color theme for the rendered SVG. `'light'` (default) keeps the original
   * colors untouched; `'dark'` lightness-inverts fills, strokes, and text and
   * paints a dark background.
   */
  theme?: Theme;
}

export function render(source: string, opts: RenderOptions = {}): SVGSVGElement {
  const scene = applyTheme(compile(source), opts.theme ?? 'light');
  const renderer = new SvgRenderer(opts.document ? { document: opts.document } : {});
  return renderer.render(scene);
}

export function compile(source: string): Scene {
  const ast = parse(source);
  const scene = layout(ast);
  const directives = detectUnsupportedDirectives(source);
  return applyPreprocessorWarningBanner(scene, directives);
}

export function parseToAst(source: string): DiagramAst {
  return parse(source);
}

export { tokenize } from './lexer/index.js';
export {
  parse,
  detectKind,
  parseSequence,
  parseClass,
  parseUseCase,
  parseState,
  parseComponent,
  parseDeployment,
  parseObject,
  parseActivity,
  parseMindmap,
  parseWbs,
  parseGantt,
  parseJson,
  parseYaml,
  parseEbnf,
  parseRegex,
  parseTiming,
} from './parser/index.js';
export { layout } from './layout/index.js';
export { SvgRenderer } from './render/svg/index.js';
export { applyTheme } from './render/theme.js';
export type { Theme } from './render/theme.js';
export {
  detectUnsupportedDirectives,
  applyPreprocessorWarningBanner,
} from './preprocessor-warnings.js';
export type { Token, TokenKind, Position } from './lexer/index.js';
export type {
  DiagramAst,
  DiagramKind,
  UnknownAst,
  PlaceholderAst,
  SequenceAst,
  Participant,
  ParticipantShape,
  SequenceStatement,
  MessageStmt,
  NoteStmt,
  ActivateStmt,
  DeactivateStmt,
  GroupStartStmt,
  GroupElseStmt,
  GroupEndStmt,
  AutoNumberStmt,
  DividerStmt,
  GroupKind,
  ArrowStyle,
  NotePosition,
  ClassAst,
  ClassDecl,
  ClassKind,
  ClassMember,
  EnumConstant,
  Visibility,
  UseCaseAst,
  UCNode,
  UCNodeKind,
  UCRelationship,
  UCContainer,
  StateAst,
  StateNode,
  StateKind,
  StateTransition,
  ContainerAst,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
  ActivityAst,
  ActivityNode,
  IfNode,
  WhileNode,
  RepeatNode,
  ForkNode,
  TreeNode,
  MindmapAst,
  WbsAst,
  GanttTask,
  GanttAst,
  WeekdayName,
  JsonAst,
  YamlAst,
  TimingAst,
  TimingTrack,
  TimingTrackKind,
  TimingEvent,
  EbnfRule,
  EbnfAst,
  RegexAst,
} from './ast/index.js';
export type { Scene, Shape } from './scene/types.js';
export type { Renderer } from './render/renderer.js';
