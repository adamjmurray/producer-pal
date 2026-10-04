// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What the E2E suites that need the Producer Pal remote script share.

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { remoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { beforeAll } from "vitest";
import { callToolAndSettle, parseToolResult } from "../../mcp-test-helpers";
import { remoteScriptAnswers } from "../../workflow/helpers/server-capability-test-helpers";

/** Whether the suites that need the remote script run at all. */
export const REMOTE_SCRIPT_E2E = process.env.E2E_REMOTE_SCRIPT === "true";

/**
 * Fail the suite, rather than skip it, when E2E_REMOTE_SCRIPT is set but the
 * remote script isn't answering. Call it ahead of setupMcpTestContext, so it
 * fails before any Live Set opens.
 */
export function requireRemoteScript(): void {
  beforeAll(async () => {
    if (!(await remoteScriptAnswers())) {
      throw new Error(
        `E2E_REMOTE_SCRIPT=true, but the Producer Pal remote script isn't running: nothing answered GET /ping on 127.0.0.1:${String(remoteScriptPort())}. Install it and select it as a control surface (see remote-script/README.md).`,
      );
    }
  });
}

/** A preset as the remote script lists it. */
export interface Preset {
  name: string;
  /** Its path under its browser section */
  path: string;
}

/**
 * A device's presets, straight from the remote script, so a test picks one this
 * machine's Live has instead of naming one another edition may lack.
 * @param type - The remote script `type` of the device's section
 * @param device - The device's browser name
 * @returns Each preset's name and path under the section
 */
export async function listPresets(
  type: string,
  device: string,
): Promise<Preset[]> {
  const query = new URLSearchParams({ type, path: device, presets: "true" });
  const response = await fetch(
    `http://127.0.0.1:${String(remoteScriptPort())}/list?${query.toString()}`,
  );
  const body = (await response.json()) as { items?: Preset[] };

  return body.items ?? [];
}

/**
 * The first preset of one file type.
 * @param presets - A device's presets
 * @param suffix - ".adv" or ".adg"
 * @returns The preset
 * @throws Error when the device has none, so the test fails rather than passes
 */
export function presetEndingIn(presets: Preset[], suffix: string): Preset {
  const preset = presets.find(({ name }) => name.endsWith(suffix));

  if (preset == null) {
    throw new Error(`no ${suffix} preset in this Live`);
  }

  return preset;
}

/**
 * A preset's name as the tools take it: without its file suffix.
 * @param name - The browser's name for it
 * @returns The name
 */
export function presetName(name: string): string {
  return name.replace(/\.(?:adv|adg)$/, "");
}

/** What `ppal-read-device` returns for a device, as far as the tests look. */
export interface DeviceRead {
  id: string;
  type: string;
  name?: string;
}

/**
 * Read a device.
 * @param client - Connected MCP client
 * @param path - The device's path
 * @returns Its id, type and name
 */
export async function readDevice(
  client: Client,
  path: string,
): Promise<DeviceRead> {
  return parseToolResult<DeviceRead>(
    await callToolAndSettle(client, "ppal-read-device", { path }),
  );
}
