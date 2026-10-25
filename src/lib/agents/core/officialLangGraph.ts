/**
 * Official LangGraph.js runtime (https://www.langchain.com/langgraph).
 * Package: @langchain/langgraph (langchain-ai/langgraphjs).
 * Browser build: @langchain/langgraph/web
 */
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isGraphInterrupt,
} from "@langchain/langgraph/web";
import type { GraphDefinition } from "./LangGraphOrchestrator";

const AstraState = Annotation.Root({
  data: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...(left ?? {}), ...(right ?? {}) }),
    default: () => ({}),
  }),
});

export const OFFICIAL_LANGGRAPH = {
  package: "@langchain/langgraph",
  version: "1.4.13",
  sourceUrl: "https://github.com/langchain-ai/langgraphjs",
  docsUrl: "https://www.langchain.com/langgraph",
};

const checkpointer = new MemorySaver();
const compiled = new Map<string, ReturnType<StateGraph<typeof AstraState.spec>["compile"]>>();

export function compileOfficialGraph(graph: GraphDefinition) {
  const cached = compiled.get(graph.id);
  if (cached) return cached;

  let builder = new StateGraph(AstraState);
  for (const node of graph.nodes) {
    const id = node.id;
    builder = builder.addNode(id, async (state) => {
      if (node.kind === "approval") {
        const decision = interrupt({ gate: id, payload: state.data });
        return { data: { ...state.data, [`${id}_decision`]: decision } };
      }
      const handler =
        node.handler ??
        (async (s: Record<string, unknown>) => ({
          [`${id}_done`]: true,
          processedAt: new Date().toISOString(),
          ...s,
        }));
      const output = await handler({ ...(state.data as Record<string, unknown>) });
      return { data: { ...state.data, ...output } };
    }) as typeof builder;
  }

  const g = builder as unknown as {
    addEdge: (from: string, to: string) => typeof builder;
    compile: (opts: { checkpointer: MemorySaver }) => ReturnType<StateGraph<typeof AstraState.spec>["compile"]>;
  };
  g.addEdge(START, graph.entry);
  const outgoing = new Set(graph.edges.map((e) => e.from));
  for (const e of graph.edges) g.addEdge(e.from, e.to);
  for (const n of graph.nodes) {
    if (!outgoing.has(n.id)) g.addEdge(n.id, END);
  }

  const app = g.compile({ checkpointer });
  compiled.set(graph.id, app);
  return app;
}

export async function invokeOfficialGraph(
  graph: GraphDefinition,
  threadId: string,
  input: Record<string, unknown>,
): Promise<{ status: "COMPLETED" | "PAUSED_FOR_APPROVAL" | "FAILED"; state: Record<string, unknown>; error?: string; lastNode?: string }> {
  const app = compileOfficialGraph(graph);
  const config = { configurable: { thread_id: threadId } };
  try {
    const result = await app.invoke({ data: input }, config);
    return { status: "COMPLETED", state: (result?.data as Record<string, unknown>) ?? input };
  } catch (err: unknown) {
    if (isGraphInterrupt(err)) {
      return {
        status: "PAUSED_FOR_APPROVAL",
        state: input,
        lastNode: (err as { interrupts?: Array<{ value?: { gate?: string } }> }).interrupts?.[0]?.value?.gate,
      };
    }
    return { status: "FAILED", state: input, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resumeOfficialGraph(
  graph: GraphDefinition,
  threadId: string,
  resumeValue: unknown,
): Promise<{ status: "COMPLETED" | "PAUSED_FOR_APPROVAL" | "FAILED"; state: Record<string, unknown>; error?: string }> {
  const app = compileOfficialGraph(graph);
  const config = { configurable: { thread_id: threadId } };
  try {
    const result = await app.invoke(new Command({ resume: resumeValue }), config);
    return { status: "COMPLETED", state: (result?.data as Record<string, unknown>) ?? {} };
  } catch (err: unknown) {
    if (isGraphInterrupt(err)) {
      return { status: "PAUSED_FOR_APPROVAL", state: {} };
    }
    return { status: "FAILED", state: {}, error: err instanceof Error ? err.message : String(err) };
  }
}
