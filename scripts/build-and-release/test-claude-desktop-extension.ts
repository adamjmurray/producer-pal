#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

// Test script for the stdio-HTTP bridge without requiring Claude Desktop installation
import { spawn } from "node:child_process";

const DEFAULT_HTTP_URL = "http://localhost:3350/mcp";
const JSON_RPC_VERSION = "2.0";
const TOOLS_LIST_METHOD = "tools/list";

interface JsonRpcResponse {
  error?: string;
  raw?: string;
  result?: {
    serverInfo?: { name?: string };
    protocolVersion?: string;
    tools?: { name: string }[];
    content?: unknown[];
  };
}

// Show usage if --help is provided
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: test-claude-desktop-extension.ts [url] [tool-name] [tool-args-json]",
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
    "  test-claude-desktop-extension.ts                                    # Basic bridge test",
  );
  console.log(
    "  test-claude-desktop-extension.ts http://localhost:3350/mcp          # Custom URL",
  );
  console.log(
    "  test-claude-desktop-extension.ts ppal-read-live-set                     # Test ppal-read-live-set tool",
  );
  console.log(
    "  test-claude-desktop-extension.ts ppal-read-track '{\"trackIndex\": 0}' # Test with arguments",
  );
  console.log("");
  process.exit(0);
}

// Parse command line arguments
let httpUrl = DEFAULT_HTTP_URL;
let toolName: string | null = null;
let toolArgs: Record<string, unknown> = {};

const arg2 = process.argv[2];

if (arg2) {
  // Check if first arg looks like a URL
  if (arg2.includes("://")) {
    httpUrl = arg2;
    toolName = process.argv[3] ?? null;
    toolArgs = process.argv[4]
      ? (JSON.parse(process.argv[4]) as Record<string, unknown>)
      : {};
  } else {
    // First arg is tool name
    toolName = arg2;
    toolArgs = process.argv[3]
      ? (JSON.parse(process.argv[3]) as Record<string, unknown>)
      : {};
  }
}

console.log(`Testing stdio-HTTP bridge...`);
console.log(`HTTP URL: ${httpUrl}`);

// Start the bridge
const bridge = spawn(
  "node",
  ["claude-desktop-extension/producer-pal-portal.js"],
  {
    stdio: ["pipe", "pipe", "pipe"], // Capture stderr so we can filter it
    env: { ...process.env, PRODUCER_PAL_PORT: new URL(httpUrl).port },
  },
);

// MCP protocol messages
const initMessage = {
  jsonrpc: JSON_RPC_VERSION,
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
  jsonrpc: JSON_RPC_VERSION,
  method: TOOLS_LIST_METHOD,
  params: {},
  id: 2,
};

const testSequence = ["initialize", TOOLS_LIST_METHOD];

// Add specific tool call if provided
if (toolName) {
  testSequence.push("tools/call");
  console.log(`Will test tool call: ${toolName}(${JSON.stringify(toolArgs)})`);
}

console.log(`Test sequence: ${testSequence.join(" → ")}`);
console.log("");

let responseCount = 0;
const startTime = Date.now();

/**
 * Send a JSON-RPC message to the bridge process
 * @param message - JSON-RPC message to send
 * @param description - Human-readable description for logging
 */
function sendMessage(message: object, description: string): void {
  console.log(`[${Date.now() - startTime}ms] Sending ${description}...`);
  bridge.stdin.write(JSON.stringify(message) + "\n");
}

let responseBuffer = "";

/**
 * Parse response data from the bridge, handling partial/incomplete JSON
 * @param data - Raw data buffer from bridge stdout
 * @returns Parsed JSON response or null if incomplete
 */
function parseResponse(data: Buffer): JsonRpcResponse | null {
  responseBuffer += data.toString();

  // Try to parse the accumulated buffer
  try {
    const response = JSON.parse(responseBuffer.trim()) as JsonRpcResponse;

    responseBuffer = ""; // Clear buffer on successful parse

    return response;
  } catch {
    // If parse fails, check if we have a complete JSON by counting braces
    const openBraces = (responseBuffer.match(/{/g) ?? []).length;
    const closeBraces = (responseBuffer.match(/}/g) ?? []).length;

    if (openBraces === closeBraces && openBraces > 0) {
      // We have balanced braces but still can't parse - it's a real error
      const error: JsonRpcResponse = {
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

/**
 * Log response based on response count and content
 * @param response - Parsed JSON-RPC response
 * @param count - Sequential response number
 * @param tool - Tool name being tested (if applicable)
 */
function logResponse(
  response: JsonRpcResponse,
  count: number,
  tool: string | null,
): void {
  if (response.error) {
    console.log("❌ Error:", response.error);
    if (response.raw) console.log("Raw data:", response.raw);

    return;
  }

  if (response.result) {
    if (count === 1) {
      // Initialize response
      console.log("✅ Initialize successful");
      console.log(
        `   Server: ${response.result.serverInfo?.name ?? "Unknown"}`,
      );
      console.log(`   Protocol: ${response.result.protocolVersion}`);
    } else if (count === 2) {
      // Tools list response
      const toolCount = response.result.tools?.length ?? 0;

      console.log(`✅ Tools list successful - ${toolCount} tools available`);

      if (toolCount > 0 && response.result.tools) {
        const toolNames = response.result.tools.map((t) => t.name).join(", ");

        console.log(
          `   Tools: ${toolNames.substring(0, 100)}${toolNames.length > 100 ? "..." : ""}`,
        );
      }
    } else if (count === 3) {
      // Tool call response
      console.log(`✅ Tool call '${tool}' successful`);

      if (response.result.content) {
        console.log(`   Content items: ${response.result.content.length}`);
      }
    }

    return;
  }

  console.log(
    "⚠️  Unexpected response format:",
    JSON.stringify(response, null, 2),
  );
}

/**
 * Continue test sequence based on response count
 * @param count - Number of responses received so far
 * @param elapsed - Time elapsed since test start in milliseconds
 */
function continueTestSequence(count: number, elapsed: number): void {
  if (count === 1) {
    sendMessage(listToolsMessage, TOOLS_LIST_METHOD);
  } else if (count === 2 && toolName) {
    const toolCallMessage = {
      jsonrpc: JSON_RPC_VERSION,
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
}

// Listen for responses
bridge.stdout.on("data", (data: Buffer) => {
  const response = parseResponse(data);

  // If response is null, we're still accumulating data
  if (response === null) {
    return;
  }

  responseCount++;
  const elapsed = Date.now() - startTime;

  console.log(`[${elapsed}ms] Bridge response ${responseCount}:`);
  logResponse(response, responseCount, toolName);
  console.log("");
  continueTestSequence(responseCount, elapsed);
});

// Filter stderr to reduce noise from bridge debugging
bridge.stderr.on("data", (data: Buffer) => {
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
