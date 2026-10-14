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
import { isNewerVersion } from "#src/shared/version-check.ts";
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
 * Whether the Live under test is at least a version.
 *
 * @param client - Connected MCP client
 * @param min - The oldest version that passes, like "12.4"
 * @returns True when Live is `min` or later
 */
export async function liveVersionAtLeast(
  client: Client,
  min: string,
): Promise<boolean> {
  return !isNewerVersion(await readLiveVersion(client), min);
}

/**
 * Skip every test in the enclosing describe on a Live older than `min`. Call it
 * after setupMcpTestContext, whose hook connects the client.
 *
 * @param ctx - The describe's MCP test context
 * @param min - The oldest Live the tests run on, like "12.4"
 * @param reason - What the older Live lacks
 */
export function skipBeforeLive(
  ctx: McpTestContext,
  min: string,
  reason: string,
): void {
  let supported: boolean | undefined;

  beforeEach(async ({ skip }) => {
    supported ??= await liveVersionAtLeast(ctx.client!, min);
    skip(!supported, `needs Live ${min} or later: ${reason}`);
  });
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
