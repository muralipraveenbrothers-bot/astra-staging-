/**
 * ASTRA — DR. MAYIN GESTURE CONTROLLER (browser-native)
 * ============================================================================
 * Pipeline:
 *
 *   Camera → getUserMedia() → MediaPipe Tasks Vision → WASM → hand landmarks
 *          → MayinGestureController → contextual semantic command
 *
 * There is NO Python gesture service, no OpenCV and no PM2 entry. MediaPipe is
 * imported lazily and only when gestures are actually enabled, so the core
 * Astra bundle and the EMR / lab / pharmacy paths are untouched.
 *
 * GESTURE SEMANTICS ARE CONTEXTUAL: "pinch" selects a lab value in a lab panel
 * and selects a bony structure in the anatomy viewer.
 *
 * Failure is always local: camera denied, WASM missing or model fetch failing
 * sets state "unavailable" while mouse + voice keep working.
 */

import { agentBus } from "@/astra/runtime/agentBus";
import {
  classifyStaticGesture,
  rotationDeltaDeg,
  twoHandGeometry,
  zoomFactor,
  type Landmark,
  type PhysicalGesture,
  type TwoHandGeometry,
} from "./mayinGestureMath";
import type { VisualQuality } from "@/features/mayin/core/MayinTypes";

/** Semantic actions a gesture can resolve to, given the current context. */
export type GestureAction =
  | "select"
  | "drag_move"
  | "zoom"
  | "rotate"
  | "reset_workspace"
  | "reveal_controls"
  | "none";

export interface GestureCommand {
  gesture: PhysicalGesture;
  action: GestureAction;
  /** Human-readable reason, surfaced in the UI so the doctor sees the mapping. */
  rationale: string;
  /** Continuous payload for zoom (factor) / rotate (degrees). */
  magnitude?: number;
  objectId?: string;
  ts: number;
}

/** What the doctor has selected and which module is active. */
export interface GestureContext {
  module?: string;
  selectedObjectId?: string;
  /** Anatomy viewer active → gestures drive the 3D model. */
  anatomyActive?: boolean;
  /** Allows "peace" to reset the visual workspace. */
  workspaceResettable?: boolean;
}

export type GestureEngineState = "idle" | "starting" | "running" | "unavailable";

export interface GestureDiagnostics {
  state: GestureEngineState;
  cameraActive: boolean;
  lastError?: string;
  inferenceHz: number;
  framesProcessed: number;
  lastGesture?: PhysicalGesture;
  lastAction?: GestureAction;
}

/** HandLandmarker surface we depend on — keeps this module testable. */
export interface HandLandmarkerLike {
  detectForVideo(video: unknown, timestampMs: number): { landmarks?: Landmark[][] };
  close?: () => void;
}

export type LandmarkerFactory = () => Promise<HandLandmarkerLike>;

export interface GestureControllerOptions {
  /** Injected in tests; production uses the lazy MediaPipe factory. */
  landmarkerFactory?: LandmarkerFactory;
  videoElement?: HTMLVideoElement | null;
  streamFactory?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Inference cadence by visual quality — heavy modes are never used in LOW. */
  quality?: VisualQuality;
}

const INFERENCE_HZ: Record<VisualQuality, number> = { HIGH: 25, BALANCED: 22, LOW: 12 };
const MIN_INFERENCE_HZ = 10;

/** One processed camera frame, exposed read-only for local overlays. */
export interface GestureCameraFrame {
  landmarks: Landmark[][];
  timestamp: number;
}

export class MayinGestureController {
  private state: GestureEngineState = "idle";
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarkerLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rafHandle: number | null = null;
  private lastFrameAt = 0;
  private busy = false;
  private hidden = false;
  private inferenceMsTotal = 0;
  private inferenceSamples = 0;
  private onVisibilityChange: (() => void) | null = null;
  private diagnostics: GestureDiagnostics = {
    state: "idle",
    cameraActive: false,
    inferenceHz: INFERENCE_HZ.BALANCED,
    framesProcessed: 0,
  };

  private context: GestureContext = {};
  private previousSpan: number | null = null;
  private previousAngle: number | null = null;
  private pinchActive = false;
  private listeners = new Set<(command: GestureCommand) => void>();
  private frameListeners = new Set<(frame: GestureCameraFrame) => void>();
  private options: GestureControllerOptions;

  constructor(options: GestureControllerOptions = {}) {
    this.options = options;
    if (options.quality) this.diagnostics.inferenceHz = INFERENCE_HZ[options.quality];
  }

  public setContext(context: GestureContext): void {
    this.context = { ...this.context, ...context };
  }

  public setQuality(quality: VisualQuality): void {
    this.diagnostics.inferenceHz = INFERENCE_HZ[quality];
  }

  public getDiagnostics(): GestureDiagnostics {
    return { ...this.diagnostics };
  }

  public getState(): GestureEngineState {
    return this.state;
  }

  /**
   * Map one physical gesture to a semantic action for the CURRENT context.
   * Pure and public so the contextual contract is directly testable.
   */
  public static interpret(
    gesture: PhysicalGesture,
    context: GestureContext,
    allowContinuous = true,
  ): { action: GestureAction; rationale: string } {
    switch (gesture) {
      case "pinch":
        return {
          action: "select",
          rationale: context.selectedObjectId
            ? `Pinch selects ${context.selectedObjectId}.`
            : context.anatomyActive
              ? "Pinch selects the anatomy structure under the pointer."
              : "Pinch selects the item under the pointer.",
        };
      case "point":
        return {
          action: "select",
          rationale: context.anatomyActive
            ? "Pointing highlights the anatomy structure being indicated."
            : "Pointing selects the item being indicated.",
        };
      case "open_palm":
        return { action: "reveal_controls", rationale: "Open palm reveals contextual controls." };
      case "peace":
        return context.workspaceResettable
          ? { action: "reset_workspace", rationale: "Peace resets the visual workspace only." }
          : {
              action: "none",
              rationale:
                "Peace ignored: it may only reset the visual workspace, never clinical data.",
            };
      case "fist":
        return allowContinuous
          ? { action: "drag_move", rationale: "Closed hand with movement moves the visual panel." }
          : { action: "none", rationale: "No draggable panel is active." };
      default:
        return { action: "none", rationale: "No gesture recognised." };
    }
  }

  public onCommand(handler: (command: GestureCommand) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Raw per-frame landmark access for local overlays (PiP skeleton, viewer
   * gesture processors). Frames are also emitted when no hand is visible so
   * overlays can clear. Nothing is recorded or sent anywhere.
   */
  public onFrame(listener: (frame: GestureCameraFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Attach/replace the video element the camera stream renders into. */
  public setVideoElement(video: HTMLVideoElement | null): void {
    this.options = { ...this.options, videoElement: video };
    if (video && this.stream) {
      video.srcObject = this.stream;
      void video.play().catch(() => undefined);
    }
  }

  /** Start camera + landmark inference. Resolves to the resulting state. */
  public async start(): Promise<GestureEngineState> {
    if (this.state === "running") return this.state;
    this.state = "starting";
    this.diagnostics.state = "starting";
    try {
      const streamFactory =
        this.options.streamFactory ??
        ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
      this.stream = await streamFactory({
        video: { width: 640, height: 360, facingMode: "user" },
        audio: false,
      });
      this.diagnostics.cameraActive = true;

      if (this.options.videoElement) {
        this.options.videoElement.srcObject = this.stream;
        await this.options.videoElement.play().catch(() => undefined);
      }

      const factory = this.options.landmarkerFactory ?? lazyMediaPipeLandmarkerFactory();
      this.landmarker = await factory();

      this.state = "running";
      this.diagnostics.state = "running";
      this.lastFrameAt = 0;
      this.watchTabVisibility();
      agentBus.publish("gesture.engine.started", {});
      agentBus.publish("vision.camera.started", { visibleIndicator: true });
      this.scheduleNextFrame();
      return this.state;
    } catch (err) {
      this.state = "unavailable";
      this.diagnostics.state = "unavailable";
      this.diagnostics.lastError = err instanceof Error ? err.message : String(err);
      // Gesture is an accelerator only — it must never block the doctor.
      this.stopCamera();
      return this.state;
    }
  }

  public async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.rafHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = null;
    if (this.onVisibilityChange && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.onVisibilityChange = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.stopCamera();
    if (this.options.videoElement) this.options.videoElement.srcObject = null;
    this.state = "idle";
    this.diagnostics.state = "idle";
    agentBus.publish("gesture.engine.stopped", {});
    agentBus.publish("vision.camera.stopped", {});
  }

  /** Test-only: feed one frame of landmarks straight through the pipeline. */
  public __processFrameForTest(hands: Landmark[][]): GestureCommand | null {
    return this.processHands(hands);
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.diagnostics.cameraActive = false;
  }

  /** Detection pauses while the tab is hidden (camera light may stay on per OS). */
  private watchTabVisibility(): void {
    if (typeof document === "undefined") return;
    this.hidden = document.hidden;
    this.onVisibilityChange = () => {
      this.hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /**
   * Frame scheduling: requestVideoFrameCallback when the video supports it,
   * otherwise requestAnimationFrame, otherwise a timer (non-DOM test runs).
   * A new frame is only taken when the previous one finished and the fps
   * budget allows it — detection can never pile up on a slow machine.
   */
  private scheduleNextFrame(): void {
    if (this.state !== "running") return;
    const video = this.options.videoElement as
      | (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
      | null
      | undefined;
    if (video && typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => void this.runFrame());
    } else if (typeof requestAnimationFrame === "function") {
      this.rafHandle = requestAnimationFrame(() => void this.runFrame());
    } else {
      this.timer = setTimeout(() => void this.runFrame(), 1000 / this.diagnostics.inferenceHz);
    }
  }

  private async runFrame(): Promise<void> {
    if (this.state !== "running" || !this.landmarker || this.busy) {
      if (this.state === "running") this.scheduleNextFrame();
      return;
    }
    if (this.hidden) {
      this.scheduleNextFrame();
      return;
    }
    const now = performance.now();
    const minInterval = 1000 / this.diagnostics.inferenceHz;
    if (now - this.lastFrameAt < minInterval - 1) {
      this.scheduleNextFrame();
      return;
    }
    this.lastFrameAt = now;
    this.busy = true;
    try {
      const started = performance.now();
      const result = this.landmarker.detectForVideo(
        this.options.videoElement ?? null,
        started,
      );
      this.trackInferenceCost(performance.now() - started);
      this.diagnostics.framesProcessed += 1;
      const landmarks = result?.landmarks ?? [];
      this.emitFrame(landmarks, started);
      if (landmarks.length) this.processHands(landmarks);
    } catch (err) {
      this.diagnostics.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
      this.scheduleNextFrame();
    }
  }

  /**
   * Frame-budget guard: if detection consistently costs more than ~⅔ of the
   * frame interval, step the cadence down so the 3D view keeps its fps.
   */
  private trackInferenceCost(ms: number): void {
    this.inferenceMsTotal += ms;
    this.inferenceSamples += 1;
    if (this.inferenceSamples < 40) return;
    const average = this.inferenceMsTotal / this.inferenceSamples;
    const budget = (1000 / this.diagnostics.inferenceHz) * 0.66;
    if (average > budget && this.diagnostics.inferenceHz > MIN_INFERENCE_HZ) {
      this.diagnostics.inferenceHz = Math.max(
        MIN_INFERENCE_HZ,
        Math.round(this.diagnostics.inferenceHz * 0.75),
      );
    }
    this.inferenceMsTotal = 0;
    this.inferenceSamples = 0;
  }

  private emitFrame(landmarks: Landmark[][], timestamp: number): void {
    if (!this.frameListeners.size) return;
    const frame: GestureCameraFrame = { landmarks, timestamp };
    for (const listener of this.frameListeners) {
      try {
        listener(frame);
      } catch (err) {
        console.warn("gesture frame listener error:", err);
      }
    }
  }

  /** Convert landmark frames into semantic commands (also used by tests). */
  private processHands(hands: Landmark[][]): GestureCommand | null {
    if (hands.length >= 2) {
      const geometry = twoHandGeometry(hands[0], hands[1]);
      if (geometry) {
        const continuous = this.continuousCommand(geometry);
        this.previousSpan = geometry.span;
        this.previousAngle = geometry.angle;
        if (continuous) return continuous;
      }
    }

    const hand = hands[0];
    if (!hand) {
      this.pinchActive = false;
      return null;
    }
    const single = classifyStaticGesture(hand);
    this.diagnostics.lastGesture = single.gesture;

    // Pinch edges fire once, so holding a pinch does not spam select.
    if (single.gesture === "pinch") {
      if (this.pinchActive) return null;
      this.pinchActive = true;
    } else {
      this.pinchActive = false;
    }
    if (single.gesture === "none") return null;

    const { action, rationale } = MayinGestureController.interpret(single.gesture, this.context);
    if (action === "none") return null;

    const command: GestureCommand = {
      gesture: single.gesture,
      action,
      rationale,
      objectId: this.context.selectedObjectId,
      ts: Date.now(),
    };
    this.diagnostics.lastAction = action;
    this.emit(command);
    return command;
  }

  private continuousCommand(geometry: TwoHandGeometry): GestureCommand | null {
    if (this.previousSpan === null || this.previousAngle === null) return null;
    const previous: TwoHandGeometry = { span: this.previousSpan, angle: this.previousAngle };

    const rotation = rotationDeltaDeg(previous, geometry);
    if (Math.abs(rotation) >= 6 && this.context.anatomyActive) {
      const command: GestureCommand = {
        gesture: "open_palm",
        action: "rotate",
        rationale: "Two-hand twist rotates the anatomy model.",
        magnitude: rotation,
        ts: Date.now(),
      };
      this.diagnostics.lastAction = "rotate";
      this.emit(command);
      return command;
    }

    const factor = zoomFactor(previous, geometry);
    if (Math.abs(factor - 1) >= 0.08) {
      const command: GestureCommand = {
        gesture: "open_palm",
        action: "zoom",
        rationale: "Two hands apart zooms in; together zooms out.",
        magnitude: factor,
        ts: Date.now(),
      };
      this.diagnostics.lastAction = "zoom";
      this.emit(command);
      return command;
    }
    return null;
  }

  private emit(command: GestureCommand): void {
    agentBus.publish("gesture.command", {
      gesture: command.gesture,
      action: command.action,
      objectId: command.objectId,
    });
    for (const listener of this.listeners) {
      try {
        listener(command);
      } catch (err) {
        console.warn("gesture command listener error:", err);
      }
    }
  }
}

/**
 * LOCAL MediaPipe assets — vendored under public/mediapipe so gesture control
 * works with the network cable unplugged and nothing is ever fetched from a
 * CDN (privacy: no patient-adjacent data leaves the hospital machine).
 */
export const MEDIAPIPE_WASM_BASE = "/mediapipe/wasm";
export const MEDIAPIPE_LOCAL_MODULE = "/mediapipe/vision_bundle.mjs";

function handModelUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  // A hospital may pin its own local copy; the default stays on-origin.
  return env.VITE_MEDIAPIPE_HAND_MODEL || "/mediapipe/models/hand_landmarker.task";
}

interface MediaPipeVisionModule {
  FilesetResolver: { forVisionTasks(basePath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<unknown>;
  };
}

async function importVisionModule(): Promise<MediaPipeVisionModule> {
  try {
    // Installed locally in node_modules → bundled by Vite, zero network cost.
    const mod = await import("@mediapipe/tasks-vision");
    return mod as unknown as MediaPipeVisionModule;
  } catch {
    // Vendored ES module served from this same origin (public/mediapipe/).
    const mod = await import(/* @vite-ignore */ MEDIAPIPE_LOCAL_MODULE);
    return mod as unknown as MediaPipeVisionModule;
  }
}

/**
 * Lazy MediaPipe Tasks Vision loader. The dependency is imported only when the
 * doctor turns gestures on, so a missing package or offline model fetch can
 * never affect Astra's clinical surfaces.
 *
 * LOCAL ONLY: wasm from /mediapipe/wasm, model from /mediapipe/models/. If
 * those files are missing this throws an honest "Hand model not installed"
 * error — it NEVER falls back to the internet.
 */
export function lazyMediaPipeLandmarkerFactory(): LandmarkerFactory {
  return async () => {
    let vision: MediaPipeVisionModule;
    try {
      vision = await importVisionModule();
    } catch (err) {
      throw new Error(
        `Hand model not installed: the MediaPipe vision bundle could not be loaded ` +
          `(tried the bundled @mediapipe/tasks-vision package and ${MEDIAPIPE_LOCAL_MODULE}). ` +
          `Astra remains fully usable with mouse, keyboard and voice. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }

    let fileset: unknown;
    try {
      fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
    } catch (err) {
      throw new Error(
        `Hand model not installed: wasm assets are missing under ${MEDIAPIPE_WASM_BASE}. ` +
          `Astra remains fully usable with mouse, keyboard and voice. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const modelAssetPath = handModelUrl();
    let lastError: unknown = null;
    // GPU delegate first, CPU fallback (same order as the old local loader).
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return landmarker as HandLandmarkerLike;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `Hand model not installed: ${modelAssetPath} could not be loaded on GPU or CPU. ` +
        `Astra remains fully usable with mouse, keyboard and voice. ` +
        `(${lastError instanceof Error ? lastError.message : String(lastError)})`,
    );
  };
}

/** One controller per Astra session; the overlay owns its lifecycle. */
export const mayinGestureController = new MayinGestureController();
