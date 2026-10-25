import { pluginManager } from "../src/plugins/PluginManager";

pluginManager.loadCatalog();
const s = pluginManager.getEcosystemSummary();
console.log("catalogSize:", s.catalogSize);
console.log("tiers:", JSON.stringify(s.tiers));
let agents = 0, tools = 0;
for (const m of pluginManager.getCatalog()) {
  agents += m.agents.length;
  tools += m.tools.length;
}
console.log("agents declared:", agents, "| tools declared:", tools);