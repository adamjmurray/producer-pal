#!/usr/bin/env node
// e2e/cli.js

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Default URL for the MCP server running in Ableton Live
const DEFAULT_URL = "http://localhost:3350/mcp";

// Get URL from command line or use default
const url = process.argv[2] || DEFAULT_URL;

console.log(`Connecting to MCP server at: ${url}`);

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(url));

  const client = new Client({
    name: "e2e-cli",
    version: "1.0.0",
  }, {
    capabilities: {}
  });

  try {
    // Connect to the server
    console.log("Connecting to server...");
    await client.connect(transport);
    console.log("Connected successfully!");

    // The server info is stored in _serverVersion (which actually contains both name and version)
    console.log("\nServer Info:");
    if (client._serverVersion) {
      console.log(`  Name: ${client._serverVersion.name}`);
      console.log(`  Version: ${client._serverVersion.version}`);
    } else {
      console.log("  Server info not available");
    }

    // List available tools
    console.log("\nAvailable Tools:");
    const tools = await client.listTools();
    
    if (tools.tools && tools.tools.length > 0) {
      tools.tools.forEach((tool, index) => {
        console.log(`\n${index + 1}. ${tool.name}`);
        if (tool.description) {
          console.log(`   Description: ${tool.description}`);
        }
        if (tool.inputSchema) {
          console.log(`   Input Schema: ${JSON.stringify(tool.inputSchema, null, 2).split('\n').join('\n   ')}`);
        }
      });
    } else {
      console.log("  No tools found");
    }

    // Close the connection
    await client.close();
    console.log("\nConnection closed.");

  } catch (error) {
    console.error("\nError:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);