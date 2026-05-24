import type { Scene } from '../scene/types.js';

export interface Renderer<T> {
  render(scene: Scene): T;
}
