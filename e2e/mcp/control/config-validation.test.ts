// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * POST /config refuses a bad body whole, and REST drops ppal-live-api in
 * small-model mode the way MCP does.
 *
 * Run with: npm run e2e:mcp -- control/config-validation
 */
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_URL, resetConfig, setConfig } from "../mcp-test-helpers.ts";

const REST_BASE_URL = CONFIG_URL.replace("/config", "");
const LIVE_API = "ppal-live-api";

type Config = Record<string, unknown>;

/**
 * @returns The device's current config
 */
async function getConfig(): Promise<Config> {
  const response = await fetch(CONFIG_URL);

  return (await response.json()) as Config;
}

/**
 * @param body - Raw body to POST to /config
 * @returns The response
 */
async function postConfig(body: object): Promise<Response> {
  return await fetch(CONFIG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let original: Config | undefined;

afterEach(async () => {
  await resetConfig();

  if (original) {
    await setConfig({ liveApiEnabled: original.liveApiEnabled as boolean });
    original = undefined;
  }
});

describe("POST /config validation", () => {
  it("applies nothing when one field is good and one is bad", async () => {
    original = await getConfig();
    const marker = `e2e-${Date.now()}`;

    const response = await postConfig({
      projectContext: marker,
      smallModelMode: "yes",
    });
    const body = (await response.json()) as { fields: Config };

    expect(response.status).toBe(400);
    expect(Object.keys(body.fields)).toStrictEqual(["smallModelMode"]);

    const after = await getConfig();

    expect(after.projectContext).toBe(original.projectContext);
    expect(after.smallModelMode).toBe(original.smallModelMode);
  });

  it('refuses the string "false" for a boolean field', async () => {
    original = await getConfig();

    const response = await postConfig({ smallModelMode: "false" });

    expect(response.status).toBe(400);
    expect((await getConfig()).smallModelMode).toBe(original.smallModelMode);
  });
});

describe("REST in small-model mode", () => {
  it("neither lists nor runs ppal-live-api", async () => {
    original = await getConfig();
    await setConfig({ liveApiEnabled: true, smallModelMode: true });

    const listResponse = await fetch(`${REST_BASE_URL}/api/tools`);
    const { tools } = (await listResponse.json()) as {
      tools: Array<{ name: string }>;
    };

    expect(tools.map((t) => t.name)).not.toContain(LIVE_API);

    const callResponse = await fetch(`${REST_BASE_URL}/api/tools/${LIVE_API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "live_set", operations: [] }),
    });

    expect(callResponse.status).toBe(404);
  });
});
