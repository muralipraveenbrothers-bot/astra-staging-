// ASTRA ↔ Human Atlas Communication Bridge
// Uses postMessage / CustomEvent for microfrontend isolation

export type AnatomyCommandType =
  | "ANATOMY_READY"
  | "ASTRA_ANATOMY_SEARCH"
  | "ASTRA_ANATOMY_SELECT"
  | "ASTRA_ANATOMY_ISOLATE"
  | "ASTRA_ANATOMY_SHOW_SYSTEM"
  | "ASTRA_ANATOMY_HIDE_SYSTEM"
  | "ASTRA_ANATOMY_EXPLODE"
  | "ASTRA_ANATOMY_RESET"
  | "ASTRA_ANATOMY_CAMERA_RESET"
  | "ASTRA_ANATOMY_SHOW_ALL"
  | "ANATOMY_SELECTED_STRUCTURE"
  | "ANATOMY_ERROR";

export interface AnatomyCommand {
  type: AnatomyCommandType;
  payload?: Record<string, unknown>;
}

export interface AnatomySearchResult {
  id: string;
  name: string;
  system: string;
}

export interface AnatomySelectResult {
  id: string;
  name: string;
  system: string;
  description?: string;
  clinicalRelevance?: string;
}

export type AnatomyCommandHandler = (command: AnatomyCommand) => void;

class AnatomyCommandBus {
  private handlers: Set<AnatomyCommandHandler> = new Set();
  private iframeRef: HTMLIFrameElement | null = null;
  private _isReady = false;

  get isReady(): boolean {
    return this._isReady;
  }

  setReady(): void {
    this._isReady = true;
    this.notify({ type: "ANATOMY_READY" });
  }

  registerIframe(iframe: HTMLIFrameElement | null): void {
    this.iframeRef = iframe;
  }

  subscribe(handler: AnatomyCommandHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(command: AnatomyCommand): void {
    this.handlers.forEach((h) => h(command));
  }

  send(command: AnatomyCommand): void {
    // Notify local listeners
    this.notify(command);

    // Forward to Human Atlas iframe if available
    if (this.iframeRef?.contentWindow) {
      try {
        this.iframeRef.contentWindow.postMessage(
          { source: "astra", ...command },
          "*"
        );
      } catch {
        // iframe not yet ready — command still delivered locally
      }
    }

    // Also dispatch as CustomEvent for cross-component communication
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("astra:anatomy", { detail: command })
      );
    }
  }

  // Convenience methods
  search(query: string): void {
    this.send({ type: "ASTRA_ANATOMY_SEARCH", payload: { query } });
  }

  select(id: string): void {
    this.send({ type: "ASTRA_ANATOMY_SELECT", payload: { id } });
  }

  isolate(id: string): void {
    this.send({ type: "ASTRA_ANATOMY_ISOLATE", payload: { id } });
  }

  showSystem(system: string): void {
    this.send({ type: "ASTRA_ANATOMY_SHOW_SYSTEM", payload: { system } });
  }

  hideSystem(system: string): void {
    this.send({ type: "ASTRA_ANATOMY_HIDE_SYSTEM", payload: { system } });
  }

  explode(): void {
    this.send({ type: "ASTRA_ANATOMY_EXPLODE" });
  }

  reset(): void {
    this.send({ type: "ASTRA_ANATOMY_RESET" });
  }

  cameraReset(): void {
    this.send({ type: "ASTRA_ANATOMY_CAMERA_RESET" });
  }

  showAll(): void {
    this.send({ type: "ASTRA_ANATOMY_SHOW_ALL" });
  }

  reportSelected(id: string, name: string, system: string): void {
    this.send({
      type: "ANATOMY_SELECTED_STRUCTURE",
      payload: { id, name, system },
    });
  }

  reportError(error: string): void {
    this.send({ type: "ANATOMY_ERROR", payload: { error } });
  }
}

export const anatomyCommandBus = new AnatomyCommandBus();
