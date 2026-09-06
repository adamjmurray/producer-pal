#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print how many bytes the tool schemas cost the model, per profile.
 *
 * This is the `tools/list` response — what every request pays for before the
 * user has said anything. Counting the `.def.ts` sources instead overstates it
 * by roughly 1.8x: hidden params validate but are never published, and
 * `smallModel:` variants don't ship in the default profile. Once, that gap sent
 * a whole cycle of schema work chasing a number the model never saw.
 *
 * The count comes from a real server and client over an in-memory transport,
 * because the envelope the SDK builds is the thing being billed; rebuilding it
 * by hand here would drift from it silently.
 *
 * Print, don't cap. The interesting number is small-model mode, where a
 * regression is least likely to be noticed, and a hard cap would punish or
 * reward a change purely on the order it landed in. If a tripwire is ever
 * wanted, make it soft: flag large single-commit movement and name the tools.
 *
 * Usage:
 *   node scripts/stats/schema-size.ts             # totals per profile
 *   node scripts/stats/schema-size.ts --tools     # plus a per-tool breakdown
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  fmt,
  printCliNote,
  printCliTable,
  printCliTitle,
  type Row,
} from "./stats-tables.ts";

// The `code` params exist only when this is on, and no release build ships
// them. Pinned off before the tool defs load, which happens on the import
// below — left to the shell, the number would move with whoever ran it.
delete process.env.ENABLE_CODE_EXEC;

const { createMcpServer } =
  await import("#src/mcp-server/create-mcp-server.ts");

/** One measured profile: what a given build configuration publishes. */
interface Profile {
  label: string;
  options: Parameters<typeof createMcpServer>[1];
}

// Small-model mode drops ppal-live-api on its own, so it needs no flag here.
const PROFILES: Profile[] = [
  { label: "default (release)", options: {} },
  { label: "+ ppal-live-api", options: { liveApiEnabled: true } },
  { label: "small-model", options: { smallModelMode: true } },
];

/** A tool as the model receives it. */
interface ToolSize {
  name: string;
  wire: number;
  description: number;
}

/**
 * Measure one profile by listing its tools over an in-memory transport.
 *
 * @param profile - The build configuration to publish
 * @returns Every published tool's byte sizes, largest first
 */
async function measure(profile: Profile): Promise<ToolSize[]> {
  const server = createMcpServer(async () => ({}), profile.options);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "schema-size", version: "0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const { tools } = await client.listTools();

  await client.close();

  return tools
    .map((tool) => ({
      name: tool.name,
      wire: JSON.stringify(tool).length,
      description: (tool.description ?? "").length,
    }))
    .toSorted((a, b) => b.wire - a.wire);
}

/**
 * Print the totals table plus, with --tools, the per-tool breakdown of the
 * largest profile.
 *
 * @returns Nothing; writes to stdout
 */
async function main(): Promise<void> {
  const measured = await Promise.all(
    PROFILES.map(async (profile) => [profile, await measure(profile)] as const),
  );

  printCliTitle("Tool schema size — what tools/list sends the model");
  printCliTable(
    ["profile", "bytes", "tools"],
    measured.map(([profile, sizes]): Row => [
      profile.label,
      fmt(sizes.reduce((sum, tool) => sum + tool.wire, 0)),
      String(sizes.length),
    ]),
  );

  if (!process.argv.includes("--tools")) {
    printCliNote("run with --tools for the per-tool breakdown");

    return;
  }

  // Break down the widest profile: every tool in the others appears in it too.
  const widest = measured.reduce((best, entry) =>
    entry[1].length >= best[1].length ? entry : best,
  );

  printCliTitle(`Per tool — ${widest[0].label}`);
  printCliTable(
    ["tool", "bytes", "description"],
    widest[1].map((tool): Row => [
      tool.name,
      fmt(tool.wire),
      fmt(tool.description),
    ]),
  );
}

await main();
