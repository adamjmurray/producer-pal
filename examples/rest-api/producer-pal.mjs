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

/** Call a Producer Pal tool by name */
async function callTool(name, args = {}) {
  const res = await fetch(`${BASE_URL}/api/tools/${name}`, {
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

  // Read tracks in the Live Set
  console.log("\nReading tracks...");
  const tracks = await callTool("ppal-read-live-set");
  console.log(tracks.result);

  // Read a specific track with all clips
  console.log("\nReading track 0 with clips...");
  const track = await callTool("ppal-read-track", {
    trackIndex: 0,
    include: ["session-clips", "arrangement-clips"],
  });
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
