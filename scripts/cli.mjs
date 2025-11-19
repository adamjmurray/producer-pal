#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Helper function to print large text without truncation
/**
 * Print text line by line to avoid truncation
 *
 * @param {string} text - Text to print
 * @param {string} prefix - Prefix to add to each line
 */
function printLargeText(text, prefix = "") {
  const lines = text.split("\n");
  lines.forEach((line) => {
    console.log(prefix + line);
  });
}

// Default URL for the MCP server running in Ableton Live
const DEFAULT_URL = "http://localhost:3350/mcp";

// Parse command line arguments
/**
 *
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let command = null;
  let toolName = null;
  let toolArgs = null;

  // Check if first arg is a URL (contains ://)
  if (args[0] && args[0].includes("://")) {
    url = args[0];
    args.shift();
  }

  // Check for command
  if (args[0]) {
    command = args[0];
    if (command === "tools/call") {
      if (!args[1] || !args[2]) {
        console.error(
          "Error: tools/call requires tool name and JSON arguments",
        );
        console.error(
          "Usage: cli.mjs [url] tools/call <tool-name> '<json-args>'",
        );
        process.exit(1);
      }
      toolName = args[1];
      try {
        toolArgs = JSON.parse(args[2]);
      } catch (e) {
        console.error("Error: Invalid JSON arguments:", e.message);
        process.exit(1);
      }
    }
  }

  return { url, command, toolName, toolArgs };
}

/**
 *
 */
async function main() {
  const { url, command, toolName, toolArgs } = parseArgs();

  console.log(`Connecting to MCP server at: ${url}`);

  const transport = new StreamableHTTPClientTransport(new URL(url));

  const client = new Client(
    {
      name: "cli-tool",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  try {
    // Connect to the server
    console.log("Connecting to server...");
    await client.connect(transport);
    console.log("Connected successfully!");

    // Always show server info
    console.log("\nServer Info:");
    if (client._serverVersion) {
      console.log(`  Name: ${client._serverVersion.name}`);
      console.log(`  Version: ${client._serverVersion.version}`);
    } else {
      console.log("  Server info not available");
    }

    // Handle commands
    if (command === "tools/list") {
      console.log("\nAvailable Tools:");
      const { tools } = await client.listTools();

      if (tools?.length > 0) {
        tools.forEach((tool, index) => {
          console.log(`\n${index + 1}. ${tool.name}`);
          if (tool.description) {
            console.log(`   Description: ${tool.description}`);
          }
          if (tool.inputSchema) {
            console.log(`   Input Schema:`);
            const schemaJson = JSON.stringify(tool.inputSchema, null, 2);
            printLargeText(schemaJson, "   ");
          }
        });
      } else {
        console.log("  No tools found");
      }
    } else if (command === "tools/call") {
      console.log(`\nCalling tool: ${toolName}`);
      console.log(`Arguments: ${JSON.stringify(toolArgs, null, 2)}`);

      const result = await client.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      console.log("\nResult:");
      if (result.isError) {
        console.log("ERROR:");
      }
      if (result.content) {
        result.content.forEach((content, index) => {
          if (content.type === "text") {
            console.log(content.text);
          } else if (content.type === "resource") {
            console.log(`Resource: ${content.resource.uri}`);
            if (content.resource.text) {
              console.log(content.resource.text);
            }
          } else {
            console.log(`Content ${index}:`, JSON.stringify(content, null, 2));
          }
        });
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else if (command) {
      console.error(`\nError: Unknown command '${command}'`);
      console.error("Available commands: tools/list, tools/call");
      process.exit(1);
    }

    // Close the connection
    await client.close();
    console.log("\nConnection closed.");
  } catch (error) {
    console.error("\nError:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause.message);
    }
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Show usage if --help is provided
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: cli.mjs [url] [command] [args...]");
  console.log("");
  console.log("Commands:");
  console.log("  (none)                    Connect and show server info");
  console.log("  tools/list                List available tools");
  console.log("  tools/call <name> <json>  Call a tool with JSON arguments");
  console.log("");
  console.log("Examples:");
  console.log("  cli.mjs");
  console.log("  cli.mjs tools/list");
  console.log("  cli.mjs tools/call ppal-read-live-set '{}'");
  console.log("  cli.mjs http://localhost:6274/mcp tools/list");
  console.log(
    '  cli.mjs tools/call create-track \'{"trackIndex": 0, "name": "Test"}\'',
  );
  process.exit(0);
}

main().catch(console.error);
