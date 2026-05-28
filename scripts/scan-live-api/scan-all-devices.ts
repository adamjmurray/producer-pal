#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Comprehensive per-device scan. Iterates EVERY device on EVERY track in the
// current Live Set, recording each device's type name, class_name,
// class_display_name, and full info block. Groups results by
// (type, class_name) to surface devices that expose a specialized Live API
// class beyond the generic "Device" baseline.
//
// Companion to setup-all-devices.ts (which builds the test bed) and
// scan-live-api.ts (which surveys core LOM object types rather than devices).
//
// Usage: node scripts/scan-live-api/scan-all-devices.ts [output-file] [--url=http://...]
//   output-file  Output path (default: dev/per-device-scan.txt)
//   --url=URL    Server base URL (default: http://localhost:3350)

import { writeFileSync } from "node:fs";
import {
  getInfo,
  getPropertyValue,
  getTypeName,
  parseInfo,
  type InfoEntry,
} from "./helpers.ts";

const DEFAULT_URL = "http://localhost:3350";
const MAX_TRACKS = 20;
const MAX_DEVICES_PER_TRACK = 50;

interface DeviceRecord {
  trackIdx: number;
  trackName: string;
  deviceIdx: number;
  typeName: string;
  className: string;
  classDisplayName: string;
  name: string;
  info: string;
}

/**
 * Parse command line arguments
 * @returns Parsed arguments
 */
function parseArgs(): { outputPath: string; baseUrl: string } {
  let outputPath = "dev/per-device-scan.txt";
  let baseUrl = DEFAULT_URL;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--url=")) {
      baseUrl = arg.slice(6);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/scan-live-api/scan-all-devices.ts [output-file] [--url=http://...]",
      );
      console.log("");
      console.log(
        "Scans every device on every track and groups by (type, class_name).",
      );
      console.log(
        "Uses the REST API (always available, no debug build needed).",
      );
      console.log("");
      console.log("Options:");
      console.log(
        "  output-file    Output path (default: dev/per-device-scan.txt)",
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
 * Scan every device on the first N tracks
 * @param baseUrl - Server base URL
 * @param maxTracks - Track count limit
 * @returns Array of device records
 */
async function scanAllDevices(
  baseUrl: string,
  maxTracks: number,
): Promise<DeviceRecord[]> {
  const records: DeviceRecord[] = [];

  for (let t = 0; t < maxTracks; t++) {
    const trackPath = `live_set tracks ${t}`;

    if (!(await getInfo(baseUrl, trackPath))) {
      console.log(`Track ${t}: not found, stopping`);
      break;
    }

    const trackName =
      (await getPropertyValue(baseUrl, trackPath, "name")) ?? "";

    process.stdout.write(`Track ${t} "${trackName}": `);

    let deviceIdx = 0;

    while (deviceIdx < MAX_DEVICES_PER_TRACK) {
      const devicePath = `${trackPath} devices ${deviceIdx}`;
      const info = await getInfo(baseUrl, devicePath);

      if (!info || !/^type \w+/m.test(info)) break;

      const classDisplayName =
        (await getPropertyValue(baseUrl, devicePath, "class_display_name")) ??
        "";
      const className =
        (await getPropertyValue(baseUrl, devicePath, "class_name")) ?? "";

      records.push({
        trackIdx: t,
        trackName,
        deviceIdx,
        typeName: getTypeName(info),
        className,
        classDisplayName,
        name: (await getPropertyValue(baseUrl, devicePath, "name")) ?? "",
        info,
      });

      process.stdout.write(`${classDisplayName || className} `);
      deviceIdx++;
    }

    console.log(`(${deviceIdx} devices)`);
  }

  return records;
}

/**
 * Group records by (typeName:className) to find unique device shapes
 * @param records - Device records
 * @returns Groups keyed by "type:class"
 */
function groupByShape(records: DeviceRecord[]): Map<string, DeviceRecord[]> {
  const groups = new Map<string, DeviceRecord[]>();

  for (const r of records) {
    const key = `${r.typeName}:${r.className}`;
    const group = groups.get(key);

    if (group) {
      group.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  return groups;
}

/**
 * Append entries of one kind under a heading
 * @param lines - Output lines (mutated)
 * @param heading - Section heading
 * @param entries - Entries to render
 * @param render - Maps an entry to its line text
 */
function appendSection(
  lines: string[],
  heading: string,
  entries: InfoEntry[],
  render: (e: InfoEntry) => string,
): void {
  if (entries.length === 0) return;

  lines.push(`  ${heading}:`);

  for (const e of entries) lines.push(`    ${render(e)}`);
}

/**
 * Format a single shape group as readable text
 * @param key - Group key
 * @param recs - Records in this group
 * @returns Text lines
 */
function formatGroup(key: string, recs: DeviceRecord[]): string[] {
  const representative = recs[0] as DeviceRecord;
  const members = recs
    .map(
      (r) => `${r.classDisplayName || r.name}@t${r.trackIdx}/d${r.deviceIdx}`,
    )
    .join(", ");

  const lines: string[] = [
    `### ${key}`,
    `Devices (${recs.length}): ${members}`,
    "",
  ];
  const entries = parseInfo(representative.info);
  const children = entries.filter(
    (e) => e.kind === "children" || e.kind === "child",
  );

  appendSection(lines, "Children", children, (c) => {
    const plural = c.kind === "children" ? " (list)" : "";

    return `${c.name}: ${c.type ?? "?"}${plural}`;
  });
  appendSection(
    lines,
    "Properties",
    entries.filter((e) => e.kind === "property"),
    (p) => `${p.name}: ${p.type ?? "?"}`,
  );
  appendSection(
    lines,
    "Functions",
    entries.filter((e) => e.kind === "function"),
    (f) => `${f.name}()`,
  );

  return lines;
}

/**
 * Build the full output text
 * @param records - Device records
 * @param groups - Grouped records
 * @returns Formatted text
 */
function formatOutput(
  records: DeviceRecord[],
  groups: Map<string, DeviceRecord[]>,
): string {
  const lines: string[] = [
    "Comprehensive Per-Device Scan",
    `Date: ${new Date().toISOString()}`,
    `Total devices scanned: ${records.length}`,
    `Unique type:class shapes: ${groups.size}`,
    "",
    "=".repeat(70),
    "",
    "DEVICE INVENTORY (by track):",
    "",
  ];

  for (const r of records) {
    lines.push(
      `  t${r.trackIdx}/d${r.deviceIdx}  ${(r.classDisplayName || r.name).padEnd(28)}` +
        `  type=${r.typeName.padEnd(18)} class=${r.className}`,
    );
  }

  lines.push("", "=".repeat(70), "", "UNIQUE DEVICE SHAPES:", "");

  // Non-generic shapes first, then alphabetical.
  const keys = [...groups.keys()].sort((a, b) => {
    const aGeneric = a.startsWith("Device:");
    const bGeneric = b.startsWith("Device:");

    if (aGeneric !== bGeneric) return aGeneric ? 1 : -1;

    return a.localeCompare(b);
  });

  for (const key of keys) {
    lines.push(
      "",
      ...formatGroup(key, groups.get(key) as DeviceRecord[]),
      "",
      "-".repeat(70),
    );
  }

  return lines.join("\n") + "\n";
}

/**
 * Main
 */
async function main(): Promise<void> {
  const { outputPath, baseUrl } = parseArgs();

  console.log("Comprehensive device scan starting...\n");

  const records = await scanAllDevices(baseUrl, MAX_TRACKS);
  const groups = groupByShape(records);

  console.log(`\nTotal devices scanned: ${records.length}`);
  console.log(`Unique (type:class) shapes: ${groups.size}`);

  writeFileSync(outputPath, formatOutput(records, groups));
  console.log(`Output: ${outputPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
