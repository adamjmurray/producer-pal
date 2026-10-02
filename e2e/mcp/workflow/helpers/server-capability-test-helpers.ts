// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What the Live and server under test can do, for tests that depend on it.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult } from "../../mcp-test-helpers.ts";

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
 * Whether this Live can load a sample into Simpler. Simpler's `replace_sample`
 * arrived in Live 12.4; on 12.3 a `sample` write warn-skips instead.
 *
 * @param client - Connected MCP client
 * @returns True on Live 12.4 and later
 */
export async function supportsSampleLoading(client: Client): Promise<boolean> {
  const [major = 0, minor = 0] = (await readLiveVersion(client))
    .split(".")
    .map(Number);

  return major > 12 || (major === 12 && minor >= 4);
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
  const port = process.env.PPAL_REMOTE_SCRIPT_PORT ?? "3349";

  return await fetch(`http://127.0.0.1:${port}/ping`, {
    signal: AbortSignal.timeout(1000),
  }).then(
    (response) => response.ok,
    () => false,
  );
}
