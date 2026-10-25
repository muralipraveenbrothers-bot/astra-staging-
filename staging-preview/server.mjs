import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const page = await readFile(new URL("./index.html", import.meta.url));
const port = Number(process.env.ASTRA_STAGING_PREVIEW_PORT ?? 5273);

createServer((request, response) => {
  if (request.url === "/" || request.url === "/index.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(page);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}).listen(port, "127.0.0.1", () => {
  console.log(`ASTRA staging preview listening on http://127.0.0.1:${port}/`);
});
