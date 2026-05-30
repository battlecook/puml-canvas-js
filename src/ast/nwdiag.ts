/**
 * Network diagram AST. The PlantUML wrapper is `@startnwdiag` and the
 * minimal grammar this parser supports is:
 *
 *   nwdiag { ... }              // optional outer block; stripped
 *   network NAME { ... }        // declares a horizontal network bar
 *     address = "..."           // optional property assigned to the network
 *     NODE                      // identifier on its own line attaches a node
 *     NODE [address = "..."]    // node with inline properties
 *
 * Only the bits required for the failing demo input are implemented:
 *   - an empty network body must close cleanly on `}`
 *   - the outer `nwdiag { ... }` wrapper is optional
 *   - properties may be followed by, but do not require, a trailing newline
 */
export interface NwdiagNode {
  /** Stable identifier as written in the source (e.g. `web01`). */
  id: string;
  /** Optional `address = "..."` property attached to the node within a
   * network membership. */
  address?: string;
}

export interface NwdiagNetwork {
  /** Stable identifier as written in the source (e.g. `dmz`). */
  id: string;
  /** Display name; same as `id` unless a future grammar adds an alias. */
  name: string;
  /** Optional CIDR or address string from `address = "..."`. */
  address?: string;
  /** Member node identifiers, in source order. */
  nodes: NwdiagNode[];
}

/** A top-level node declared outside any `network { ... }` block.
 *  Optional `shape` attribute (e.g. `cloud`, `rect`) governs how it renders. */
export interface NwdiagTopNode {
  /** Stable identifier (e.g. `inet`). */
  id: string;
  /** Shape keyword from `[shape = X]`. Undefined defaults to a plain box. */
  shape?: string;
}

/** Undirected link between two nodes declared at the top level via `A -- B`. */
export interface NwdiagLink {
  from: string;
  to: string;
}

export interface NwdiagAst {
  kind: 'nwdiag';
  networks: NwdiagNetwork[];
  /** Top-level node declarations (outside any network block). */
  nodes?: NwdiagTopNode[];
  /** Top-level inter-node links. */
  links?: NwdiagLink[];
}
