export type ClassKind = 'class' | 'interface' | 'enum' | 'abstract' | 'annotation' | 'record';

export type Visibility = 'public' | 'private' | 'protected' | 'package' | 'none';

export interface ClassMember {
  memberKind: 'field' | 'method';
  visibility: Visibility;
  name: string;
  type: string;
  params: string;
  isStatic: boolean;
  isAbstract: boolean;
}

export interface EnumConstant {
  name: string;
}

export interface ClassDecl {
  id: string;
  name: string;
  classKind: ClassKind;
  stereotype: string;
  members: ClassMember[];
  enumConstants: EnumConstant[];
  /**
   * Optional visibility marker that appeared BEFORE the `class` keyword in the
   * declaration, e.g. `-class "private Class"` (private), `#class ...`
   * (protected), `~class ...` (package), `+class ...` (public). PlantUML uses
   * this as a header-glyph hint; layout draws a small `+`/`-`/`#`/`~` in the
   * top-left corner of the class header when set.
   */
  visibility?: Visibility;
  /**
   * Inline class styling — set from a trailing `#<styleBlock>` on the class
   * declaration, e.g. `class Foo #back:red;line:00FFFF`. Tokens recognized:
   *   `back:<color>`     → fill
   *   `line:<color>`     → borderColor
   *   `line.bold`        → borderStyle = 'bold'
   *   `line.dashed[:c]`  → borderStyle = 'dashed' (+ optional borderColor)
   *   `line.dotted[:c]`  → borderStyle = 'dotted' (+ optional borderColor)
   *   `header:<c>[/<c>]` → headerFill (single color) or headerGradient (two-stop)
   *   bare `#<color>`    → fill
   *   `back:c1|c2`       → headerGradient-style background gradient (we keep
   *                        the first color as `fill` and stash the second).
   */
  fill?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  headerFill?: string;
  headerGradient?: [string, string];
  fillGradient?: [string, string];
}

export type RelationKind =
  | 'inheritance'
  | 'realization'
  | 'association'
  | 'dependency'
  | 'composition'
  | 'aggregation';

export type EndMarker =
  | 'none'
  | 'arrow'
  | 'triangle'
  | 'diamond-filled'
  | 'diamond-open';

export type LabelDirection = 'forward' | 'backward' | 'none';

/**
 * Inline direction hint embedded in an arrow body, e.g. the `left` in
 * `-left->`. PlantUML uses this token as a layout suggestion: the target
 * should sit on the named side of the source. Style (solid/dashed) and
 * head/tail markers are classified from the dash/dot run alone, so the hint
 * is stripped before the rest of the arrow is parsed.
 */
export type RelationDirection = 'left' | 'right' | 'up' | 'down';

export interface ClassRelationship {
  source: string;
  target: string;
  sourceMult: string;
  targetMult: string;
  arrowToken: string;
  kind: RelationKind;
  style: 'solid' | 'dashed';
  sourceMarker: EndMarker;
  targetMarker: EndMarker;
  label: string;
  labelDirection: LabelDirection;
  /**
   * Optional inline direction hint stripped from the arrow body (`-left->`,
   * `--up->`, `-r->`, …). Layout consults this when positioning the target
   * relative to the source. Absent when the arrow had no hint.
   */
  direction?: RelationDirection;
}

export interface ClassAst {
  kind: 'class';
  title: string;
  classes: ClassDecl[];
  relationships: ClassRelationship[];
  hideEmptyMembers: boolean;
  /**
   * Diagram flow direction. `'TB'` (top-to-bottom, the default) stacks
   * sugiyama ranks vertically and orders nodes within a rank horizontally.
   * `'LR'` (left-to-right) swaps the two axes so ranks march across the page
   * and nodes within a rank stack vertically. Set by the `left to right
   * direction` / `top to bottom direction` source-level directives.
   */
  direction?: 'TB' | 'LR';
}
