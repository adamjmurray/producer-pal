#!/usr/bin/env node

// Producer Pal REST API example (Node.js, no dependencies)
// Requires Node.js 18+ for built-in fetch
//
// Usage: node producer-pal.mjs

const BASE_URL = "http://localhost:3350";

/** List all available tools */
async function listTools() {
  const res = await fetch(`${BASE_URL}/api/tools`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.tools;
}

/**
 * Call a Producer Pal tool by name.
 *
 * Options:
 *   - format:    "json" | "compact"  Default "compact" returns `result` as a
 *                token-efficient JS-literal string. "json" returns `result`
 *                as a parsed value (object/array/etc.) and surfaces any
 *                warnings as a separate `warnings: string[]` field.
 *   - timeoutMs: 1–60000              Per-request timeout override.
 */
async function callTool(name, args = {}, options = {}) {
  const params = new URLSearchParams();
  if (options.format) params.set("format", options.format);
  if (options.timeoutMs != null)
    params.set("timeoutMs", String(options.timeoutMs));

  const url = params.toString()
    ? `${BASE_URL}/api/tools/${name}?${params}`
    : `${BASE_URL}/api/tools/${name}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Example usage ---

async function main() {
  // List available tools
  console.log("Available tools:");
  const tools = await listTools();
  for (const tool of tools) {
    console.log(`  ${tool.name} - ${tool.description.slice(0, 60)}...`);
  }

  // Inspect a tool's input schema
  const readTrack = tools.find((t) => t.name === "ppal-read-track");
  console.log(`\nSchema for ${readTrack.name}:`);
  console.log(JSON.stringify(readTrack.inputSchema, null, 2));

  // Read tracks in the Live Set (default compact format)
  console.log("\nReading tracks (compact format):");
  const tracks = await callTool("ppal-read-live-set");
  console.log(tracks.result);

  // Same call with format=json — result is a parsed object you can index into
  console.log("\nReading tracks (parsed JSON):");
  const tracksJson = await callTool(
    "ppal-read-live-set",
    {},
    { format: "json" },
  );
  console.log(`tempo: ${tracksJson.result.tempo}`);
  console.log(`scale: ${tracksJson.result.scale}`);

  // Override timeout for a potentially long call
  console.log("\nReading track 0 with all clips (10s timeout):");
  const track = await callTool(
    "ppal-read-track",
    { trackIndex: 0, include: ["session-clips", "arrangement-clips"] },
    { timeoutMs: 10000 },
  );
  console.log(track.result);
}

main().catch((err) => {
  if (err.cause?.code === "ECONNREFUSED") {
    console.error(
      "Could not connect to Producer Pal. Is Ableton Live running with the Producer Pal device?",
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
