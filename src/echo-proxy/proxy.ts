import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { proxyServer } from "mcp-proxy";

async function main() {
  const httpClient = new Client({
    name: "echo-proxy-client",
    version: "1.0.0",
  });
  const httpTransport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
  await httpClient.connect(httpTransport);

  const server = new Server(
    {
      name: "echo-proxy-server",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  const serverCapabilities = httpClient.getServerCapabilities() as {};
  console.log({ serverCapabilities });

  await proxyServer({
    server,
    client: httpClient,
    serverCapabilities,
  });

  console.log("Proxy connected and ready");
}

main().catch((error) => {
  console.error("Proxy error:", error);
  process.exit(1);
});
