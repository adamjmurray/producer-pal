// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DISABLED_TOOLS_HEADER, VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  CONNECT_TOOL_ID,
  LIVE_API_TOOL_ID,
  READ_ONLY_ALIAS,
  READ_ONLY_TOOLS,
  TOOL_GROUPS,
} from "#src/shared/tool-groups.ts";
import { buildFallbackTools } from "./fallback-tools.ts";
import { type BridgeOptions } from "./stdio-http-bridge.ts";

/**
 * Build the `--list-tools` output: the group aliases this portal understands,
 * then the tools actually available.
 *
 * The tool list comes from the DEVICE when it is reachable, falling back to the
 * portal's own catalog otherwise — the same two-tier answer the bridge gives a
 * `tools/list` request, and for the same reason. Only the device knows whether
 * its Setup-tab Direct Live API toggle is on, and only the device knows about
 * tools added after this npx-cached portal was published. The withheld toolset is
 * applied to both halves, so `--tools clip --list-tools` shows what that session
 * would really get.
 *
 * @param mcpUrl - The device's MCP endpoint
 * @param options - The parsed bridge options (the withheld toolset, Live API flag)
 * @returns The listing, ready to print
 */
export async function formatToolListing(
  mcpUrl: string,
  options: BridgeOptions,
): Promise<string> {
  const live = await fetchDeviceToolNames(mcpUrl, options.disabledTools);
  const toolLines =
    live == null
      ? [
          `Could not reach the device at ${mcpUrl}, so this is what the portal`,
          "knows. A running device may offer more (or fewer) tools.",
          "",
          ...buildFallbackTools(options)
            .tools.map((tool) => `  ${tool.name}`)
            .toSorted(),
        ]
      : [`Available now (${live.length}):`, "", ...live.map((n) => `  ${n}`)];

  return [...formatGroups(), "", ...toolLines].join("\n");
}

/**
 * The group aliases and the spelling rules — local knowledge, since the flags are
 * the portal's own and the device has never heard of them.
 * @returns The lines of the groups section
 */
function formatGroups(): string[] {
  const rows = [
    ...TOOL_GROUPS.map((group) => [group.alias, group.toolIds] as const),
    [READ_ONLY_ALIAS, READ_ONLY_TOOLS] as const,
  ];
  const width = Math.max(...rows.map(([alias]) => alias.length));

  return [
    `Producer Pal ${VERSION} — tools and groups`,
    "",
    "Pass any of these to --tools (keep only these) or --disable-tools (drop",
    "these), comma or space separated. Names work bare or ppal- prefixed.",
    "",
    ...rows.map(
      ([alias, toolIds]) => `  ${alias.padEnd(width)}  ${toolIds.join(" ")}`,
    ),
    "",
    `${CONNECT_TOOL_ID} is always kept — it is how an MCP client reaches the Skills.`,
    `${LIVE_API_TOOL_ID} also needs --live-api or the device's Setup-tab toggle.`,
  ];
}

/**
 * Ask the device what it offers this client, or null when it can't be reached.
 *
 * Deliberately does NOT go through `StdioHttpBridge`: that owns a stdio server
 * this one-shot query has no use for, and any failure here is an expected outcome
 * (Ableton isn't running) rather than something to log and retry.
 *
 * @param mcpUrl - The device's MCP endpoint
 * @param disabledTools - Tools this client withholds, if any
 * @returns The tool names, or null when the device is unreachable
 */
async function fetchDeviceToolNames(
  mcpUrl: string,
  disabledTools?: string[],
): Promise<string[] | null> {
  const client = new Client({ name: "producer-pal-portal", version: "1.0.0" });

  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(mcpUrl),
      disabledTools?.length
        ? {
            requestInit: {
              headers: { [DISABLED_TOOLS_HEADER]: disabledTools.join(",") },
            },
          }
        : undefined,
    );

    await client.connect(transport);

    const { tools } = await client.listTools();

    return tools.map((tool) => tool.name).toSorted();
  } catch (error) {
    // stderr, not stdout: the caller prints the listing to stdout, and a reader
    // piping it somewhere shouldn't get a diagnostic mixed into the data.
    console.error(`[--list-tools] device unreachable: ${errorMessage(error)}`);

    return null;
  } finally {
    await client.close().catch(() => {
      // Nothing to do — we already have (or failed to get) the list.
    });
  }
}
