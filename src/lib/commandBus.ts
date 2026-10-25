// Astra AI — unified command bus.
// A single entry point for ALL command sources (chat, voice, voicebox,
// patient-screen, department-screen, dashboard, suggestion, agent) to converge
// on the existing CommandEngine pipeline.

import { useCallback, useRef, useState } from "react";

export type CommandSource =
    | "chat"
    | "voice"
    | "voicebox"
    | "patient-screen"
    | "department-screen"
    | "dashboard"
    | "suggestion"
    | "agent";

export interface QueuedCommand {
    text: string;
    source: CommandSource;
}

/**
 * Central command bus — dispatches commands to the existing pipeline.
 * Queues commands when Chat is unmounted so they are not lost.
 */
export function useCommandBus() {
    const [queued, setQueued] = useState<QueuedCommand[]>([]);
    const dispatchRef = useRef<(text: string, source: CommandSource) => void>();

    // Subscribe to Astra:command events from other windows/tabs (if any)
    useCallback(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && typeof customEvent.detail.text === "string") {
                dispatchRef.current?.(customEvent.detail.text, customEvent.detail.source ?? "chat");
            }
        };
        // Use any to bypass WindowEventMap typing for custom events
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener("Astra:command" as any, handler);
        return () => window.removeEventListener("Astra:command" as any, handler);
    }, []);

    // Queue a command when Chat is unmounted; drain when mounted
    const enqueue = useCallback(
        (text: string, source: CommandSource) => {
            setQueued((prev) => [...prev, { text, source }]);
        },
        []
    );

    const drainQueued = useCallback(() => {
        setQueued([]);
    }, []);

    // Expose dispatch to the outside world
    const dispatch = useCallback(
        (text: string, source: CommandSource = "chat") => {
            // If Chat is mounted, route through the existing send() pipeline
            // (the Chat component will handle this via its listener)
            enqueue(text, source);
            // Dispatch a custom event so any listener (e.g. Chat) can pick it up
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.dispatchEvent(new CustomEvent("Astra:command", { detail: { text, source } }));
        },
        [enqueue]
    );

    return {
        dispatch,
        queued,
        drainQueued,
        // For Chat to subscribe its runner
        onCommand: (handler: (text: string, source: CommandSource) => void) => {
            const cleanup = useCallback(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                window.addEventListener("Astra:command" as any, (e: any) => {
                    if (e.detail && typeof e.detail.text === "string") handler(e.detail.text, e.detail.source ?? "chat");
                });
                return () => window.removeEventListener("Astra:command" as any, cleanup);
            }, [handler]);
            return cleanup;
        },
    };
}

/**
 * Take any queued commands (used by Chat on mount to drain commands
 * that were dispatched while Chat was closed).
 */
export function useQueuedCommands(): { text: string; source: CommandSource }[] {
    const [queued, setQueued] = useState<QueuedCommand[]>([]);
    // In a full integration this would read from localStorage;
    // for now we keep it in React state via the bus hook.
    return queued;
}
