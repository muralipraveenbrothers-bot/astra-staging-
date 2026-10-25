/**
 * src/features/anatomy3d/Anatomy3DContext.ts
 *
 * React context + imperative API for external control of the 3D anatomy
 * viewer. Voice commands and gesture handlers call these methods.
 */

import { createContext, useContext } from "react";
import type { AnatomySystem } from "./labels";

export interface Anatomy3DAPI {
  selectStructure(name: string): void;
  rotateBy(dx: number, dy: number): void;
  zoomBy(factor: number): void;
  pan(dx: number, dy: number): void;
  reset(): void;
  startTour(system: AnatomySystem): void;
}

const noop = () => {};

export const Anatomy3DContext = createContext<Anatomy3DAPI>({
  selectStructure: noop,
  rotateBy: noop,
  zoomBy: noop,
  pan: noop,
  reset: noop,
  startTour: noop,
});

export function useAnatomy3D(): Anatomy3DAPI {
  return useContext(Anatomy3DContext);
}
