// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MIN_REMOTE_SCRIPT_VERSION } from "#src/mcp-server/rpc/remote-script/port/remote-script-version.ts";
import Max from "max-api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "../../rpc/remote-script/tests/remote-script-test-helpers.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

// Imported on each call: the debug suite reloads modules, so a static import
// would ping a different copy of the client than the app uses.
async function ping(): Promise<boolean> {
  const client =
    await import("../../rpc/remote-script/remote-script-client.ts");

  const { running } = await client.remoteScriptPing();

  return running;
}

// Whether a request to the remote script is held back as out of date. Imported
// on each call, like `ping`, and pinged first so the version is known.
async function heldBackAsOutdated(): Promise<boolean> {
  const client =
    await import("../../rpc/remote-script/remote-script-client.ts");

  await client.remoteScriptPing();

  const reply = await client.remoteScriptRequest({ route: "/list" });

  return !reply.available && reply.outdated != null;
}

async function getJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

// A release build never sets ENABLE_LIVE_API, so the suite's default is release.
describe("POST /config remote script switches on a release build", () => {
  const appState = setupExpressAppServer();
  let fake: FakeRemoteScript | undefined;

  afterEach(async () => {
    await appState.postConfig({
      remoteScriptEnabled: true,
      remoteScriptMinVersion: null,
    });
    await fake?.close();
    fake = undefined;
  });

  it("are not listed by GET /config until set", async () => {
    const config = await getJson(await fetch(appState.configUrl));

    expect(config).not.toHaveProperty("remoteScriptEnabled");
    expect(config).not.toHaveProperty("remoteScriptMinVersion");
  });

  it("make a running remote script look uninstalled, and back again", async () => {
    fake = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: MIN_REMOTE_SCRIPT_VERSION },
    }));
    expect(await ping()).toBe(true);

    const off = await appState.postConfig({ remoteScriptEnabled: false });

    const offBody = await getJson(off);

    expect(offBody.remoteScriptEnabled).toBe(false);
    expect(await ping()).toBe(false);

    await appState.postConfig({ remoteScriptEnabled: true });
    expect(await ping()).toBe(true);
  });

  it("hold a running script to the minimum version it is sent, until it is cleared", async () => {
    fake = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: MIN_REMOTE_SCRIPT_VERSION },
    }));
    expect(await heldBackAsOutdated()).toBe(false);

    const set = await getJson(
      await appState.postConfig({ remoteScriptMinVersion: "9.0.0" }),
    );

    expect(set.remoteScriptMinVersion).toBe("9.0.0");
    expect(await heldBackAsOutdated()).toBe(true);

    const cleared = await getJson(
      await appState.postConfig({ remoteScriptMinVersion: null }),
    );

    expect(cleared).not.toHaveProperty("remoteScriptMinVersion");
    expect(await heldBackAsOutdated()).toBe(false);
  });

  it("refuse a minimum version that isn't a string", async () => {
    const response = await appState.postConfig({ remoteScriptMinVersion: 3 });

    const body = await getJson(response);

    expect(response.status).toBe(400);
    expect(body.fields).toStrictEqual({
      remoteScriptMinVersion: "must be a string",
    });
  });

  it("refuse a non-boolean remoteScriptEnabled", async () => {
    const response = await appState.postConfig({ remoteScriptEnabled: "no" });

    const body = await getJson(response);

    expect(response.status).toBe(400);
    expect(body.fields).toStrictEqual({
      remoteScriptEnabled: "must be a boolean",
    });
  });

  it("stay out of the device: nothing is sent to Max", async () => {
    vi.mocked(Max.outlet).mockClear();
    await appState.postConfig({ remoteScriptEnabled: false });

    expect(Max.outlet).not.toHaveBeenCalled();
  });
});

describe("POST /config remote script switches on a debug build", () => {
  const originalEnv = process.env.ENABLE_LIVE_API;
  const appState = setupExpressAppServer({
    beforeStart: () => {
      // Fresh module load, so the new ENABLE_LIVE_API value is read.
      vi.resetModules();
      process.env.ENABLE_LIVE_API = "true";
    },
  });
  let fake: FakeRemoteScript | undefined;

  afterEach(async () => {
    await appState.postConfig({ remoteScriptEnabled: true });
    await fake?.close();
    fake = undefined;
  });

  afterAll(() => {
    if (originalEnv == null) {
      delete process.env.ENABLE_LIVE_API;
    } else {
      process.env.ENABLE_LIVE_API = originalEnv;
    }
  });

  it("lists remoteScriptEnabled from the start, on by default", async () => {
    const config = await getJson(await fetch(appState.configUrl));

    expect(config.remoteScriptEnabled).toBe(true);
  });

  it("applies remoteScriptEnabled the same as a release build", async () => {
    fake = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: MIN_REMOTE_SCRIPT_VERSION },
    }));

    await appState.postConfig({ remoteScriptEnabled: false });
    expect(await ping()).toBe(false);
  });
});
