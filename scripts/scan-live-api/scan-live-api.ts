#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scans the Ableton Live Object Model via the REST API to discover all
 * available children, properties, and functions on key object types.
 *
 * Usage: node scripts/scan-live-api/scan-live-api.ts [output-file] [--url=http://...]
 *
 * The REST endpoint for ppal-raw-live-api is always available regardless of
 * build configuration. Output defaults to dev/live-api-scan.txt.
 */

import { writeFileSync } from "node:fs";
import {
  formatOutput,
  getInfo,
  getProperty,
  getTypeName,
  parseInfo,
  scanPath,
  type ScanContext,
} from "./helpers.ts";

const DEFAULT_URL = "http://localhost:3350";
const MAX_TRACKS = 8;

const CORE_PATHS: [string, string][] = [
  ["live_set", "Song"],
  ["live_set tracks 0", "Track"],
  ["live_set tracks 0 view", "Track.View"],
  ["live_set tracks 0 mixer_device", "MixerDevice"],
  ["live_set tracks 0 mixer_device volume", "DeviceParameter"],
  ["live_set scenes 0", "Scene"],
  ["live_set tracks 0 clip_slots 0", "ClipSlot"],
  ["live_set master_track", "MasterTrack"],
  ["live_set groove_pool", "GroovePool"],
  ["live_set return_tracks 0", "ReturnTrack"],
  ["live_set cue_points 0", "CuePoint"],
];

/**
 * Parse command line arguments
 * @returns Parsed arguments
 */
function parseArgs(): { outputPath: string; baseUrl: string } {
  const args = process.argv.slice(2);
  let outputPath = "dev/live-api-scan.txt";
  let baseUrl = DEFAULT_URL;

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      baseUrl = arg.slice(6);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/scan-live-api/scan-live-api.ts [output-file] [--url=http://...]",
      );
      console.log("");
      console.log(
        "Scans the Live Object Model and dumps all discovered types to a file.",
      );
      console.log(
        "Uses the REST API (always available, no debug build needed).",
      );
      console.log("");
      console.log("Options:");
      console.log(
        "  output-file    Output path (default: dev/live-api-scan.txt)",
      );
      console.log(
        "  --url=URL      Server base URL (default: http://localhost:3350)",
      );
      process.exit(0);
    } else {
      outputPath = arg;
    }
  }

  return { outputPath, baseUrl };
}

/**
 * Scan device on a track and add if it's a new type
 * @param ctx - Scan context
 * @param trackIdx - Track index
 */
async function scanDeviceOnTrack(
  ctx: ScanContext,
  trackIdx: number,
): Promise<void> {
  const path = `live_set tracks ${trackIdx} devices 0`;

  process.stdout.write(`  Track ${trackIdx}...`);

  const info = await getInfo(ctx.baseUrl, path);

  if (!info) {
    console.log(" (empty)");

    return;
  }

  const typeName = getTypeName(info);

  if (!ctx.seenTypes.has(typeName)) {
    ctx.seenTypes.add(typeName);
    ctx.results.push({
      path,
      label: `${typeName} (track ${trackIdx})`,
      typeName,
      rawInfo: info,
      entries: parseInfo(info),
    });
    console.log(` ${typeName} ✓ (NEW)`);
  } else {
    console.log(` ${typeName} (known)`);
  }
}

/**
 * Scan chains, drum pads, and nested devices on a track
 * @param ctx - Scan context
 * @param trackIdx - Track index
 */
async function scanChainsOnTrack(
  ctx: ScanContext,
  trackIdx: number,
): Promise<void> {
  for (const childType of ["chains", "drum_pads"]) {
    const childPath = `live_set tracks ${trackIdx} devices 0 ${childType} 0`;

    await scanPath(ctx, childPath, `${childType} (track ${trackIdx})`);
    await scanPath(
      ctx,
      `${childPath} devices 0`,
      `device in ${childType} (track ${trackIdx})`,
    );
    await scanPath(
      ctx,
      `${childPath} mixer_device`,
      `mixer in ${childType} (track ${trackIdx})`,
    );
  }

  const nestedDrumRack = `live_set tracks ${trackIdx} devices 0 chains 0 devices 0`;
  const canHavePads = await getProperty(
    ctx.baseUrl,
    nestedDrumRack,
    "can_have_drum_pads",
  );

  if (canHavePads?.includes("[1]")) {
    const padPath = `${nestedDrumRack} drum_pads 0`;

    if (await scanPath(ctx, padPath, `DrumPad (track ${trackIdx})`)) {
      console.log(`  DrumPad found on track ${trackIdx}`);
    }

    await scanPath(
      ctx,
      `${padPath} chains 0 devices 0`,
      `device in drum pad (track ${trackIdx})`,
    );
  }
}

/**
 * Scan for clips and their child objects
 * @param ctx - Scan context
 */
async function scanClips(ctx: ScanContext): Promise<void> {
  console.log("\nScanning clips...");

  for (let t = 0; t < MAX_TRACKS; t++) {
    const hasClip = await getProperty(
      ctx.baseUrl,
      `live_set tracks ${t} clip_slots 0`,
      "has_clip",
    );

    if (hasClip?.includes("[1]")) {
      const clipPath = `live_set tracks ${t} clip_slots 0 clip`;

      if (await scanPath(ctx, clipPath, `Clip (track ${t})`)) {
        console.log(`  Session clip found on track ${t}`);
      }

      await scanPath(ctx, `${clipPath} groove`, `Groove (clip on track ${t})`);

      break;
    }
  }
}

/**
 * Main scan entry point
 */
async function main(): Promise<void> {
  const { outputPath, baseUrl } = parseArgs();

  console.log(`Scanning Live API at ${baseUrl}...\n`);

  const ctx: ScanContext = { baseUrl, results: [], seenTypes: new Set() };

  for (const [path, label] of CORE_PATHS) {
    process.stdout.write(`  ${label}...`);
    console.log((await scanPath(ctx, path, label)) ? " ✓" : " (not found)");
  }

  console.log("\nScanning devices...");

  for (let t = 0; t < MAX_TRACKS; t++) {
    await scanDeviceOnTrack(ctx, t);
  }

  console.log("\nScanning chains and drum pads...");

  for (let t = 0; t < MAX_TRACKS; t++) {
    await scanChainsOnTrack(ctx, t);
  }

  console.log("\nScanning Simpler sample...");

  for (let t = 0; t < MAX_TRACKS; t++) {
    if (
      await scanPath(
        ctx,
        `live_set tracks ${t} devices 0 sample`,
        `Sample (track ${t})`,
      )
    ) {
      console.log(`  Sample found on track ${t}`);

      break;
    }
  }

  await scanClips(ctx);
  await scanPath(ctx, "live_set groove_pool grooves 0", "Groove (pool)");

  writeFileSync(outputPath, formatOutput(ctx.results));
  console.log(`\nScan complete! ${ctx.results.length} types discovered.`);
  console.log(`Output: ${outputPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
