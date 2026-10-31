// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What the Live and server under test can do, for tests that depend on it.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach } from "vitest";
import { resolveRemoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import {
  isLiveVersionAtLeast,
  isNewerVersion,
} from "#src/shared/version-check.ts";
import {
  type McpTestContext,
  parseToolResult,
} from "../../mcp-test-helpers.ts";

/**
 * Ask Live which version it is, via ppal-connect.
 *
 * @param client - Connected MCP client
 * @returns The version string (e.g. "12.4.3")
 */
export async function readLiveVersion(client: Client): Promise<string> {
  const result = await client.callTool({ name: "ppal-connect", arguments: {} });

  return parseToolResult<{ abletonLiveVersion: string }>(result)
    .abletonLiveVersion;
}

/**
 * The Producer Pal Skills block ppal-connect injects. Node appends it as its own
 * content block, not in the JSON body.
 *
 * @param client - Connected MCP client
 * @returns Its text, or "" when there is none
 */
export async function readConnectSkills(client: Client): Promise<string> {
  const result = (await client.callTool({
    name: "ppal-connect",
    arguments: {},
  })) as { content?: Array<{ text?: string }> };

  return (
    result.content?.find((block) =>
      block.text?.startsWith("# Producer Pal Skills"),
    )?.text ?? ""
  );
}

/**
 * Whether the Live under test is at least a version.
 *
 * @param client - Connected MCP client
 * @param min - The oldest version that passes, like "12.4"
 * @param options - `release: true` counts a beta of `min` itself as older, as
 *   the code under test does when a beta may lack the feature
 * @param options.release - Count a beta of `min` itself as older
 * @returns True when Live is `min` or later
 */
export async function liveVersionAtLeast(
  client: Client,
  min: string,
  options?: { release?: boolean },
): Promise<boolean> {
  const version = await readLiveVersion(client);

  return options?.release === true
    ? isLiveVersionAtLeast(version, min)
    : !isNewerVersion(version, min);
}

/**
 * Skip every test in the enclosing describe on a Live older than `min`. Call it
 * after setupMcpTestContext, whose hook connects the client.
 *
 * @param ctx - The describe's MCP test context
 * @param min - The oldest Live the tests run on, like "12.4"
 * @param reason - What the older Live lacks
 * @param options - `release: true` also skips on a beta of `min` itself
 * @param options.release - Also skip on a beta of `min` itself
 */
export function skipBeforeLive(
  ctx: McpTestContext,
  min: string,
  reason: string,
  options?: { release?: boolean },
): void {
  let supported: boolean | undefined;

  beforeEach(async ({ skip }) => {
    supported ??= await liveVersionAtLeast(ctx.client!, min, options);
    skip(!supported, `needs Live ${min} or later: ${reason}`);
  });
}

/** Why a test that searches with ppal-library needs Live 12.4. */
export const LIBRARY_NEEDS = "ppal-library reads Live's browser database";

/** Why a test that writes envelope points needs Live 12.4. */
export const ENVELOPE_WRITE_NEEDS =
  "Envelope.create_event, which writes envelope points";

/**
 * Skip the running test on a Live older than `min`.
 *
 * @param client - Connected MCP client
 * @param skip - The test's `skip`
 * @param min - The oldest Live the test runs on, like "12.4"
 * @param reason - What the older Live lacks
 */
export async function skipTestBeforeLive(
  client: Client,
  skip: (note?: string) => never,
  min: string,
  reason: string,
): Promise<void> {
  if (!(await liveVersionAtLeast(client, min))) {
    skip(`needs Live ${min} or later: ${reason}`);
  }
}

/**
 * Whether the SERVED build has code execution compiled in. The flag is baked in
 * at build time (`build:debug` forces it on), so this process's own
 * ENABLE_CODE_EXEC says nothing about the device under test. `ppal-create-clip`
 * publishes its `code` param only when the feature is on, which makes the
 * published schema the honest signal.
 *
 * @param client - Connected MCP client
 * @returns True when the running device was built with code exec enabled
 */
export async function serverHasCodeExec(client: Client): Promise<boolean> {
  const { tools } = await client.listTools();
  const createClip = tools.find((tool) => tool.name === "ppal-create-clip");

  return createClip?.inputSchema.properties?.code != null;
}

/**
 * Whether the Producer Pal remote script answers its ping. Only then can
 * ppal-create-device load plug-ins and Max devices, and only then do the skills
 * teach it.
 *
 * @returns True when GET /ping answered within a second
 */
export async function remoteScriptAnswers(): Promise<boolean> {
  return await fetch(
    `http://127.0.0.1:${await resolveRemoteScriptPort()}/ping`,
    {
      signal: AbortSignal.timeout(1000),
    },
  ).then(
    (response) => response.ok,
    () => false,
  );
}
