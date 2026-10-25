import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["modules/medical-research-mcp-suite/dist/index.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  transport.stderr!.on("data", (d) => console.error("[stderr]", d.toString().slice(0, 300)));
  const client = new Client({ name: "test", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 10000 });
    const tools = await client.listTools();
    console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));
  } catch (e) {
    console.error("CONNECT ERROR:", e instanceof Error ? e.message : e);
  }
  try { await client.close(); } catch {}
  process.exit(0);
}
main();
