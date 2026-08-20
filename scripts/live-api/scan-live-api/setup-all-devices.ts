#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Sets up a Live Set with every built-in instrument, MIDI effect, and audio
// effect. Each instrument gets its own MIDI track. MIDI effects go on the
// first track (before its instrument). Audio effects are spread across tracks.
//
// This builds the reproducible test bed surveyed by scan-all-devices.ts. See
// the "Reproducing the scan" section of
// dev/Specialized-Devices.md.
//
// Usage: node scripts/live-api/scan-live-api/setup-all-devices.ts [--url=http://localhost:3350/mcp]

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_SERVER_URL = "http://localhost:3350/mcp";

const INSTRUMENTS = [
  "Analog",
  "Collision",
  "Drift",
  "Drum Rack",
  "DrumSampler",
  "Electric",
  "External Instrument",
  "Impulse",
  "Instrument Rack",
  "Meld",
  "Operator",
  "Sampler",
  "Simpler",
  "Tension",
  "Wavetable",
] as const;

const MIDI_EFFECTS = [
  "Arpeggiator",
  "CC Control",
  "Chord",
  "MIDI Effect Rack",
  "Note Length",
  "Pitch",
  "Random",
  "Scale",
  "Velocity",
] as const;

const AUDIO_EFFECTS = [
  "Amp",
  "Audio Effect Rack",
  "Auto Filter",
  "Auto Pan-Tremolo",
  "Auto Shift",
  "Beat Repeat",
  "Cabinet",
  "Channel EQ",
  "Chorus-Ensemble",
  "Compressor",
  "Corpus",
  "Delay",
  "Drum Buss",
  "Dynamic Tube",
  "Echo",
  "EQ Eight",
  "EQ Three",
  "Erosion",
  "External Audio Effect",
  "Filter Delay",
  "Gate",
  "Glue Compressor",
  "Grain Delay",
  "Hybrid Reverb",
  "Limiter",
  "Looper",
  "Multiband Dynamics",
  "Overdrive",
  "Pedal",
  "Phaser-Flanger",
  "Redux",
  "Resonators",
  "Reverb",
  "Roar",
  "Saturator",
  "Shifter",
  "Spectral Resonator",
  "Spectral Time",
  "Spectrum",
  "Tuner",
  "Utility",
  "Vinyl Distortion",
  "Vocoder",
] as const;

interface ToolContent {
  type: string;
  text?: string;
}

/**
 * Parse command line arguments
 * @returns Parsed arguments
 */
function parseArgs(): { serverUrl: string } {
  let serverUrl = DEFAULT_SERVER_URL;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--url=")) {
      serverUrl = arg.slice(6);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/live-api/scan-live-api/setup-all-devices.ts [--url=http://localhost:3350/mcp]",
      );
      console.log("");
      console.log(
        "Creates a Live Set with every built-in instrument, MIDI effect,",
      );
      console.log("and audio effect, for surveying device specialization.");
      process.exit(0);
    }
  }

  return { serverUrl };
}

/**
 * Call a Producer Pal MCP tool
 * @param client - MCP client
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns Tool result text
 */
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as ToolContent[];
  const text = content.map((c) => c.text ?? "").join("\n");

  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${text}`);
  }

  return text;
}

/**
 * Add a list of devices, one per call, reporting success/failure per device
 * @param client - MCP client
 * @param names - Device names to create
 * @param pathFor - Maps a device index to its create path
 */
async function addDevices(
  client: Client,
  names: readonly string[],
  pathFor: (index: number) => string,
): Promise<void> {
  for (let i = 0; i < names.length; i++) {
    const name = names[i] as string;

    process.stdout.write(`  ${name}...`);

    try {
      await callTool(client, "ppal-create-device", {
        deviceName: name,
        path: pathFor(i),
      });
      console.log(" ✓");
    } catch (e) {
      console.log(` FAILED: ${(e as Error).message}`);
    }
  }
}

/**
 * Main setup
 */
async function main(): Promise<void> {
  const { serverUrl } = parseArgs();
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client(
    { name: "setup-all-devices", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  console.log("=== Step 1: Create MIDI tracks for each instrument ===");

  // First track exists; rename it to the first instrument. Create the rest.
  await callTool(client, "ppal-create-track", {
    type: "midi",
    count: INSTRUMENTS.length - 1,
    name: INSTRUMENTS.slice(1).join(","),
  });
  await callTool(client, "ppal-update-track", {
    ids: "t0",
    name: INSTRUMENTS[0],
  });

  console.log(`  Created tracks 0-${INSTRUMENTS.length - 1}`);

  console.log("\n=== Step 2: Add instruments to each track ===");
  await addDevices(client, INSTRUMENTS, (i) => `t${i}`);

  console.log(
    "\n=== Step 3: Add MIDI effects to track 0 (before instrument) ===",
  );
  // Each insert at position 0 pushes the previous device down.
  await addDevices(client, MIDI_EFFECTS, () => "t0/d0");

  console.log("\n=== Step 4: Add audio effects (distribute across tracks) ===");
  // Distribute across the instrument tracks (1..N-1), appending each.
  await addDevices(
    client,
    AUDIO_EFFECTS,
    (i) => `t${(i % (INSTRUMENTS.length - 1)) + 1}`,
  );

  await client.close();
  console.log("\n=== Setup complete ===");
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
