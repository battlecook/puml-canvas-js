export interface TreeNode {
  text: string;
  children: TreeNode[];
  /**
   * WBS arithmetic notation: `-` markers (e.g. `-_ Task`) place the node on
   * the LEFT side of its parent. `+` markers (or any other marker) default to
   * the right side. Undefined means "follow the parent layout direction".
   */
  side?: 'left' | 'right';
  /**
   * `_` suffix after the WBS marker (e.g. `+_ Task`, `-_ Task`) renders the
   * node as plain text without a surrounding rectangle.
   */
  boxless?: boolean;
  /**
   * Inline node color, e.g. `*[#Orange] Colors` in a mindmap. Stored as the
   * raw color string from the source — passed through to the renderer.
   */
  color?: string;
}

export interface MindmapAst {
  kind: 'mindmap';
  title: string;
  root: TreeNode | null;
}

export interface WbsAst {
  kind: 'wbs';
  title: string;
  root: TreeNode | null;
}
