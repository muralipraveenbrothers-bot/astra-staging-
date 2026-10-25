// ASTRA AI — Voice/chat round-trip shared layer (barrel export).
//
// ONE voice interaction infrastructure for every dashboard. Do not fork these
// modules per workspace: personality differences belong in ROLE_OVERLAYS and
// workspace differences belong in the dashboard's tools/data — not in a copy of
// the voice stack.

export * from "./contracts";
export * from "./wakeDetection";
export * from "./roleOverlays";
export * from "./language";
export * from "./ttsFallback";
export * from "./deliverResponse";
export * from "./diagnostics";
export * from "./voiceGuardian";
export * from "./microphone";
