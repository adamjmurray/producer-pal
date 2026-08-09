// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the per-request headers the tool surfaces read: withheld tools
 * (x-producer-pal-disabled-tools) and notation (x-producer-pal-notation), over
 * both POST /mcp and the REST endpoints.
 *
 * These are per-CONNECTION by nature, which is the whole point — the built-in
 * chat and each subagent worker send their own values, and one caller's must
 * never reach another. So every test runs a second client alongside the shared
 * one and checks both: the header connection changed, the plain one did not.
 * The REST case adds a third party: the shared MCP client stands in for the
 * chat UI a REST caller must not drag onto its notation.
 *
 * Uses: e2e-test-set - t8 "9-MIDI" (empty MIDI track), t0/s0 "Beat"
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- per-request-headers
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { connectMcp, type McpConnection } from "#evals/chat/mcp.ts";
import { DISABLED_TOOLS_HEADER } from "#src/shared/config.ts";
import { NOTATION_HEADER } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import {
  CONFIG_URL,
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  MCP_URL,
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

/**
 * The tools the subsetting tests withhold. Chosen for their skills gates:
 * ppal-library owns the `library` fragment outright, and the three device tools
 * own `devices`, `devices-write`, and `specialized-devices` — so dropping them
 * has to shorten the blob, not just the tool list.
 */
const WITHHELD = [
  "ppal-library",
  "ppal-read-device",
  "ppal-create-device",
  "ppal-update-device",
];

/** The skills fragments {@link WITHHELD} gates out, per fragment-tool-gates.ts. */
const GATED_OUT = [
  "library",
  "devices",
  "devices-write",
  "specialized-devices",
];

/** t8 "9-MIDI": the empty MIDI track, pitched, so notes read back as a melody. */
const EMPTY_MIDI_TRACK = 8;

const extraConnections: McpConnection[] = [];

afterEach(async () => {
  await Promise.all(extraConnections.splice(0).map((c) => c.client.close()));
});

/**
 * Open a second MCP connection carrying `headers`, closed after the test.
 * @param headers - The per-request headers this connection sends
 * @returns The connected client
 */
async function connectWith(headers: Record<string, string>): Promise<Client> {
  const connection = await connectMcp(MCP_URL, { headers });

  extraConnections.push(connection);

  return connection.client;
}

/**
 * The tool names a client can see.
 * @param client - The MCP client
 * @returns Tool names in listing order
 */
async function toolNames(client: Client): Promise<string[]> {
  const { tools } = await client.listTools();

  return tools.map((tool) => tool.name);
}

/**
 * The "# Producer Pal Skills" block from a ppal-connect result. Skills are
 * appended Node-side as their own content block, not carried in the JSON body.
 * @param result - Raw ppal-connect tool result
 * @returns The skills text, or "" when absent
 */
function extractSkills(result: unknown): string {
  const typed = result as {
    content?: Array<{ text?: string }>;
  } | null;

  return (
    typed?.content?.find((c) => c.text?.startsWith("# Producer Pal Skills"))
      ?.text ?? ""
  );
}

/**
 * Call ppal-connect and return the skills it injected.
 * @param client - The MCP client
 * @returns The assembled skills blob
 */
async function connectSkills(client: Client): Promise<string> {
  return extractSkills(
    await client.callTool({ name: "ppal-connect", arguments: {} }),
  );
}

/**
 * A built-in fragment's longest line, as a marker for "this fragment shipped".
 * The longest one is prose rather than a heading or an `@include`, so it is both
 * unique to the fragment and unlikely to be a substring of anything else.
 * @param fragment - The fragment's include name
 * @returns The line
 */
function longestLine(fragment: string): string {
  const body = builtinFragments()[fragment];

  expect(body, `fragment ${fragment} not found`).toBeDefined();

  return body!
    .split("\n")
    .reduce((longest, line) => (line.length > longest.length ? line : longest));
}

/**
 * The lines one skills blob has that a shorter one doesn't.
 *
 * Comparing two blobs this way, rather than either blob against a locally
 * assembled one, is what keeps these assertions independent of the build flags
 * the DEVICE has and this test process doesn't: `code-transforms` ships only
 * under ENABLE_CODE_EXEC, so a debug build serves a blob `buildSkills()` here
 * can't reproduce. A flag-gated fragment sits in both blobs, so it cancels.
 *
 * @param full - The longer blob
 * @param gated - The blob gating shortened
 * @returns The dropped lines, blanks excluded, in the full blob's order
 */
function removedLines(full: string, gated: string): string[] {
  const kept = new Set(gated.split("\n"));

  return full.split("\n").filter((line) => line !== "" && !kept.has(line));
}

/**
 * Read a clip's notes as the caller's notation formats them.
 * @param client - The MCP client
 * @param clipId - The clip to read
 * @returns The notes string
 */
async function readNotes(client: Client, clipId: string): Promise<string> {
  const result = await client.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["notes"] },
  });

  return parseToolResult<ReadClipResult>(result).notes ?? "";
}

describe("x-producer-pal-disabled-tools", () => {
  it("withholds the tools from one caller's tools/list, not the other's", async () => {
    const subset = await connectWith({
      [DISABLED_TOOLS_HEADER]: WITHHELD.join(","),
    });
    const all = await toolNames(ctx.client!);

    expect(all).toStrictEqual(expect.arrayContaining(WITHHELD));

    // Exactly the withheld ones went, in the same order — a stricter check than
    // four not.toContain assertions, which would pass if the header also took
    // out half the registry.
    expect(await toolNames(subset)).toStrictEqual(
      all.filter((name) => !WITHHELD.includes(name)),
    );
  });

  it("refuses a call to a withheld tool", async () => {
    // The subtraction is real registration, not a filtered listing: the tool is
    // not on this caller's server at all.
    const subset = await connectWith({
      [DISABLED_TOOLS_HEADER]: "ppal-library",
    });
    const result = await subset.callTool({
      name: "ppal-library",
      arguments: { action: "listTags" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("ppal-library not found");

    // The same call on the plain connection is a normal tool call.
    expect(
      isToolError(
        await ctx.client!.callTool({
          name: "ppal-library",
          arguments: { action: "listTags" },
        }),
      ),
    ).toBe(false);
  });

  it("drops the withheld tools' skills fragments from ppal-connect", async () => {
    // Notation and mode pinned so the expected blob is deterministic whatever a
    // prior test left set.
    await setConfig({ smallModelMode: false, notation: "barbeat" });

    const subset = await connectWith({
      [DISABLED_TOOLS_HEADER]: WITHHELD.join(","),
    });
    // The caller's own listing is the toolset the server gated on. It can differ
    // from config.tools by ppal-live-api, which no fragment gates on, so the
    // assembled blob is the same either way.
    const tools = await toolNames(subset);
    const skills = await connectSkills(subset);
    const ungated = await connectSkills(ctx.client!);
    const removed = removedLines(ungated, skills);

    // The live server dropped exactly what assembling the same toolset drops
    // here — so this tracks any future skills reorg on its own, rather than
    // going stale against hand-picked content markers.
    expect(removed).toStrictEqual(
      removedLines(
        buildSkills({ notation: "barbeat" }),
        buildSkills({ notation: "barbeat", tools }),
      ),
    );

    // …and it dropped something, named by the fragments' own text, so the
    // equality above can't pass by both sides removing nothing.
    for (const fragment of GATED_OUT) {
      const marker = longestLine(fragment);

      expect(ungated).toContain(marker);
      expect(removed).toContain(marker);
    }
  });
});

const REST_BASE_URL = CONFIG_URL.replace("/config", "");

/**
 * Call a tool over the REST API with the given per-request headers.
 * @param toolName - Tool to call
 * @param args - Tool arguments
 * @param headers - The per-request headers this call sends
 * @returns The `result` field of the JSON response
 */
async function restCallTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${REST_BASE_URL}/api/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(args),
  });

  expect(response.status).toBe(200);

  const body = (await response.json()) as { result: T; isError?: boolean };

  expect(body.isError ?? false).toBe(false);

  return body.result;
}

describe("x-producer-pal-notation", () => {
  it("parses and formats one caller's notes as stark while the device stays bar|beat", async () => {
    await setConfig({ notation: "barbeat" });

    const stark = await connectWith({ [NOTATION_HEADER]: "stark" });
    // Stark syntax against a bar|beat device: this only lands if the header
    // reached V8's PARSER, not just the skills and param descriptions.
    const created = parseToolResult<CreateClipResult>(
      await stark.callTool({
        name: "ppal-create-clip",
        arguments: {
          slot: `${EMPTY_MIDI_TRACK}/0`,
          notes: "melody: C E G",
          length: "1bar",
        },
      }),
    );

    await sleep(100);

    // Same clip, both notations. The bar|beat read is the proof the notes are
    // really there — and that the global setting the other caller relies on was
    // never touched.
    const starkNotes = await readNotes(stark, created.id);
    const barbeatNotes = await readNotes(ctx.client!, created.id);

    expect(starkNotes).toContain("melody");
    expect(starkNotes).not.toContain("1|1");

    expect(barbeatNotes).toContain("1|1");
    expect(barbeatNotes).toContain("C3");
    expect(barbeatNotes).toContain("E3");
    expect(barbeatNotes).toContain("G3");
  });

  it("does the same over the REST API, leaving the MCP client on bar|beat", async () => {
    // The gap this closes: a coding agent driving REST used to have no way to
    // pick a notation except a device-wide POST /config, which would have moved
    // the MCP client asserted on below.
    await setConfig({ notation: "barbeat" });

    const created = await restCallTool<CreateClipResult>(
      "ppal-create-clip",
      {
        slot: `${EMPTY_MIDI_TRACK}/1`,
        notes: "melody: D F A",
        length: "1bar",
      },
      { [NOTATION_HEADER]: "stark" },
    );

    await sleep(100);

    const starkClip = await restCallTool<ReadClipResult>(
      "ppal-read-clip",
      { clipId: created.id, include: ["notes"] },
      { [NOTATION_HEADER]: "stark" },
    );

    expect(starkClip.notes).toContain("melody");
    expect(starkClip.notes).not.toContain("1|1");

    // Same clip, read by the untouched MCP client: the notes really landed, and
    // the device global the chat UI relies on never moved.
    const barbeatNotes = await readNotes(ctx.client!, created.id);

    expect(barbeatNotes).toContain("1|1");
    expect(barbeatNotes).toContain("D3");
    expect(barbeatNotes).toContain("F3");
    expect(barbeatNotes).toContain("A3");
  });

  it("resolves the REST tool catalog against the request's notation", async () => {
    // The catalog and execution have to agree: a stark client told to send
    // bar|beat `notes` guidance would write input its own request can't parse.
    const starkResponse = await fetch(`${REST_BASE_URL}/api/tools`, {
      headers: { [NOTATION_HEADER]: "stark" },
    });
    const globalResponse = await fetch(`${REST_BASE_URL}/api/tools`);

    const notesDescription = async (response: Response): Promise<string> => {
      const body = (await response.json()) as {
        tools: Array<{
          name: string;
          inputSchema: {
            properties?: Record<string, { description?: string }>;
          };
        }>;
      };

      return (
        body.tools.find((t) => t.name === "ppal-create-clip")?.inputSchema
          .properties?.notes?.description ?? ""
      );
    };

    expect(await notesDescription(starkResponse)).toContain("stark notation");
    expect(await notesDescription(globalResponse)).toContain(
      "bar|beat notation",
    );
  });
});
