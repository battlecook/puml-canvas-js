export interface TreeNode {
  text: string;
  children: TreeNode[];
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
