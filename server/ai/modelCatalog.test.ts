import { extractContextLength, HERMES_MIN_CONTEXT } from "./modelCatalog";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(extractContextLength({ context_length: 40960 }) === 40960, "context_length");
assert(extractContextLength({ context_window: 1048576 }) === 1048576, "context_window");
assert(extractContextLength({ details: { context_length: 32768 } }) === 32768, "details.context_length");
assert(extractContextLength({ id: "qwen3:14b" }) === null, "missing must be null, not invented");
assert(40960 < HERMES_MIN_CONTEXT, "qwen3:14b cached 40960 is below Hermes min");
assert(32768 < HERMES_MIN_CONTEXT, "qwen2.5:1.5b 32768 is below Hermes min");
assert(1048576 >= HERMES_MIN_CONTEXT, "FreeLLMAPI auto 1M is above Hermes min");
console.log("modelCatalog context extraction OK");
