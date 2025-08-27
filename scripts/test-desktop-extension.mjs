#!/usr/bin/env node
// Test script for the stdio-HTTP bridge without requiring Claude Desktop installation
import { spawn } from "child_process";

const DEFAULT_HTTP_URL = "http://localhost:3350/mcp";

// Show usage if --help is provided
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: test-desktop-extension.mjs [url] [tool-name] [tool-args-json]",
  );
  console.log("");
  console.log(
    "Tests the stdio-HTTP bridge without requiring Claude Desktop installation",
  );
  console.log("");
  console.log("Arguments:");
  console.log(
    "  url              HTTP URL of the MCP server (default: http://localhost:3350/mcp)",
  );
  console.log(
    "  tool-name        Optional tool to call after initialization and tools/list",
  );
  console.log(
    "  tool-args-json   Optional JSON arguments for the tool call (default: {})",
  );
  console.log("");
  console.log("Examples:");
  console.log(
    "  test-desktop-extension.mjs                                    # Basic bridge test",
  );
  console.log(
    "  test-desktop-extension.mjs http://localhost:3350/mcp          # Custom URL",
  );
  console.log(
    "  test-desktop-extension.mjs ppal-read-song                     # Test ppal-read-song tool",
  );
  console.log(
    "  test-desktop-extension.mjs ppal-read-track '{\"trackIndex\": 0}' # Test with arguments",
  );
  console.log("");
  process.exit(0);
}

// Parse command line arguments
let httpUrl = DEFAULT_HTTP_URL;
let toolName = null;
let toolArgs = {};

if (process.argv.length > 2) {
  // Check if first arg looks like a URL
  if (process.argv[2].includes("://")) {
    httpUrl = process.argv[2];
    toolName = process.argv[3];
    toolArgs = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  } else {
    // First arg is tool name
    toolName = process.argv[2];
    toolArgs = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  }
}

console.log(`Testing stdio-HTTP bridge...`);
console.log(`HTTP URL: ${httpUrl}`);

// Start the bridge
const bridge = spawn(
  "node",
  ["desktop-extension/claude-ableton-connector.js"],
  {
    stdio: ["pipe", "pipe", "pipe"], // Capture stderr so we can filter it
    env: { ...process.env, PRODUCER_PAL_PORT: new URL(httpUrl).port },
  },
);

// MCP protocol messages
const initMessage = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-bridge-client",
      version: "1.0.0",
    },
  },
  id: 1,
};

const listToolsMessage = {
  jsonrpc: "2.0",
  method: "tools/list",
  params: {},
  id: 2,
};

let testSequence = ["initialize", "tools/list"];

// Add specific tool call if provided
if (toolName) {
  testSequence.push("tools/call");
  console.log(`Will test tool call: ${toolName}(${JSON.stringify(toolArgs)})`);
}

console.log(`Test sequence: ${testSequence.join(" → ")}`);
console.log("");

let responseCount = 0;
let startTime = Date.now();

function sendMessage(message, description) {
  console.log(`[${Date.now() - startTime}ms] Sending ${description}...`);
  bridge.stdin.write(JSON.stringify(message) + "\n");
}

let responseBuffer = "";

function parseResponse(data) {
  responseBuffer += data.toString();

  // Try to parse the accumulated buffer
  try {
    const response = JSON.parse(responseBuffer.trim());
    responseBuffer = ""; // Clear buffer on successful parse
    return response;
  } catch (e) {
    // If parse fails, check if we have a complete JSON by counting braces
    const openBraces = (responseBuffer.match(/\{/g) || []).length;
    const closeBraces = (responseBuffer.match(/\}/g) || []).length;

    if (openBraces === closeBraces && openBraces > 0) {
      // We have balanced braces but still can't parse - it's a real error
      const error = {
        error: "Failed to parse complete response",
        raw: responseBuffer,
      };
      responseBuffer = "";
      return error;
    }

    // Otherwise, keep accumulating
    return null;
  }
}

// Listen for responses
bridge.stdout.on("data", (data) => {
  const response = parseResponse(data);

  // If response is null, we're still accumulating data
  if (response === null) {
    return;
  }

  responseCount++;
  const elapsed = Date.now() - startTime;

  console.log(`[${elapsed}ms] Bridge response ${responseCount}:`);

  if (response.error) {
    console.log("❌ Error:", response.error);
    if (response.raw) console.log("Raw data:", response.raw);
  } else if (response.result) {
    if (responseCount === 1) {
      // Initialize response
      console.log("✅ Initialize successful");
      console.log(
        `   Server: ${response.result.serverInfo?.name || "Unknown"}`,
      );
      console.log(`   Protocol: ${response.result.protocolVersion}`);
    } else if (responseCount === 2) {
      // Tools list response
      const toolCount = response.result.tools?.length || 0;
      console.log(`✅ Tools list successful - ${toolCount} tools available`);
      if (toolCount > 0) {
        const toolNames = response.result.tools.map((t) => t.name).join(", ");
        console.log(
          `   Tools: ${toolNames.substring(0, 100)}${toolNames.length > 100 ? "..." : ""}`,
        );
      }
    } else if (responseCount === 3) {
      // Tool call response
      console.log(`✅ Tool call '${toolName}' successful`);
      if (response.result.content) {
        console.log(`   Content items: ${response.result.content.length}`);
      }
    }
  } else {
    console.log(
      "⚠️  Unexpected response format:",
      JSON.stringify(response, null, 2),
    );
  }

  console.log("");

  // Continue test sequence
  if (responseCount === 1) {
    sendMessage(listToolsMessage, "tools/list");
  } else if (responseCount === 2 && toolName) {
    const toolCallMessage = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs,
      },
      id: 3,
    };
    sendMessage(toolCallMessage, `tools/call ${toolName}`);
  } else {
    // Test complete
    console.log(`✅ Test completed successfully in ${elapsed}ms`);
    bridge.kill();
  }
});

// Filter stderr to reduce noise from bridge debugging
bridge.stderr.on("data", (data) => {
  const message = data.toString();
  // Only show important errors, not routine bridge logging
  if (
    message.includes("Failed") ||
    message.includes("Error") ||
    message.includes("error")
  ) {
    console.log("Bridge stderr:", message.trim());
  }
});

bridge.on("error", (error) => {
  console.log("❌ Bridge process error:", error.message);
});

bridge.on("close", (code) => {
  const elapsed = Date.now() - startTime;
  if (code === 0) {
    console.log(`✅ Bridge exited cleanly (${elapsed}ms total)`);
    bridge.kill();
    process.exit(1);
  } else {
    console.log(`❌ Bridge exited with code ${code} (${elapsed}ms total)`);
    bridge.kill();
    process.exit(1);
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log("❌ Test timed out after 10 seconds");
  bridge.kill();
  process.exit(1);
}, 10000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⚠️  Test interrupted by user");
  bridge.kill();
  process.exit(0);
});

// Start the test
sendMessage(initMessage, "initialize");
