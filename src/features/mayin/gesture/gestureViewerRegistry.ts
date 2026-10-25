/**
 * ASTRA — GESTURE VIEWER REGISTRY
 * ============================================================================
 * 3D viewers (anatomy viewer, OrthoPlanner bone canvas) register an adapter
 * here; the gesture overlay routes ViewerGestureProcessor events to the most
 * recently mounted viewer. Local, in-memory only.
 */

export interface GestureViewerAdapter {
  id: string;
  /** Cursor over the viewer in normalised (0..1) viewer coordinates. */
  moveCursor(x: number, y: number): void;
  hideCursor(): void;
  /** Select whatever structure is under the gesture cursor. */
  selectUnderCursor(): void;
  rotateBy(dx: number, dy: number): void;
  zoomBy(factor: number): void;
  pan(dx: number, dy: number): void;
  reset(): void;
  tourStep(dir: 1 | -1): void;
  setPresentMode(on: boolean): void;
}

const stack: GestureViewerAdapter[] = [];
const listeners = new Set<() => void>();

export function registerGestureViewer(adapter: GestureViewerAdapter): () => void {
  stack.push(adapter);
  notify();
  return () => {
    const index = stack.indexOf(adapter);
    if (index >= 0) stack.splice(index, 1);
    notify();
  };
}

export function getActiveGestureViewer(): GestureViewerAdapter | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function subscribeGestureViewerRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("gesture viewer registry listener error:", err);
    }
  }
}
