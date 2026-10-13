// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readGlobalSettings,
  updateGlobalSettings,
} from "../../helpers/config-store/global-settings-store.ts";
import { syncDeviceInstallNotice } from "../../rpc/device-install/device-install-notice.ts";
import { registerGlobalSettingsRoutes } from "../../routes/config/global-settings-route.ts";
import {
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
  type MarkdownRouteServer,
} from "../config-dir-test-helpers.ts";

// The route re-checks the update after a dismissal; keep it off the network.
const { mockGetUpdate } = vi.hoisted(() => ({ mockGetUpdate: vi.fn() }));

vi.mock(import("../../helpers/http/update-check.ts"), () => ({
  getUpdate: mockGetUpdate,
}));

// The install notice is covered by its own tests; here only when it is asked.
vi.mock(import("../../rpc/device-install/device-install-notice.ts"), () => ({
  syncDeviceInstallNotice: vi.fn(async () => {}),
}));

const getDir = useTempConfigDir();

/**
 * Write a raw settings.json into the temp config dir.
 * @param text - Exact file contents
 */
function writeRawSettings(text: string): void {
  writeFileSync(join(getDir(), "settings.json"), text, "utf8");
}

describe("global settings store", () => {
  it("defaults to update checking on and nothing dismissed", () => {
    expect(readGlobalSettings()).toStrictEqual({
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    });
  });

  it("round-trips a merged patch", () => {
    updateGlobalSettings({ autoUpdateCheck: false });
    updateGlobalSettings({ dismissedUpdateVersion: "9.9.9" });

    expect(readGlobalSettings()).toStrictEqual({
      autoUpdateCheck: false,
      dismissedUpdateVersion: "9.9.9",
      warnIfInstallIncomplete: true,
    });
  });

  it("stores the incomplete-installation warning and ignores a mistyped one", () => {
    updateGlobalSettings({ warnIfInstallIncomplete: false });
    expect(readGlobalSettings().warnIfInstallIncomplete).toBe(false);

    writeRawSettings('{"warnIfInstallIncomplete": "no"}');
    expect(readGlobalSettings().warnIfInstallIncomplete).toBe(true);
  });

  it("preserves keys it doesn't know about", () => {
    // An older build must not silently drop a setting a newer one added.
    writeRawSettings('{"autoUpdateCheck": false, "fromTheFuture": 42}');

    updateGlobalSettings({ dismissedUpdateVersion: "1.0.0" });

    expect(
      JSON.parse(readFileSync(join(getDir(), "settings.json"), "utf8"))
        .fromTheFuture,
    ).toBe(42);
  });

  it("falls back to defaults on a malformed or mistyped file", () => {
    // Preferences must never wedge the features that read them.
    writeRawSettings("{ this is not json");
    expect(readGlobalSettings().autoUpdateCheck).toBe(true);

    writeRawSettings('{"autoUpdateCheck": "yes please"}');
    expect(readGlobalSettings().autoUpdateCheck).toBe(true);
  });

  it("falls back to defaults when the file holds valid JSON that isn't an object", () => {
    // JSON.parse succeeds on these, so only the shape check catches them.
    for (const text of ["[1, 2, 3]", '"just a string"', "null"]) {
      writeRawSettings(text);

      expect(readGlobalSettings()).toStrictEqual({
        autoUpdateCheck: true,
        dismissedUpdateVersion: null,
        warnIfInstallIncomplete: true,
      });
    }
  });

  it("warns and falls back when the file can't be read at all", () => {
    // A directory where the file should be: readFileSync throws EISDIR, which
    // is not the ordinary missing-file case and must be reported.
    mkdirSync(join(getDir(), "settings.json"));

    expect(readGlobalSettings().autoUpdateCheck).toBe(true);
    expect(Max.post).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read"),
      "warn",
    );
  });

  it("writes nothing when the config dir is inert", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    expect(updateGlobalSettings({ autoUpdateCheck: false })).toStrictEqual({
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    });
  });
});

describe("/settings routes", () => {
  let server: MarkdownRouteServer;
  let url: string;

  beforeEach(async () => {
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(syncDeviceInstallNotice).mockClear();
    mockGetUpdate.mockResolvedValue(null);
    server = await startMarkdownRouteServer(registerGlobalSettingsRoutes);
    url = `${server.baseUrl}/settings`;
  });

  afterEach(async () => {
    await server.close();
  });

  it("GETs the current settings, uncached", async () => {
    updateGlobalSettings({ autoUpdateCheck: false });

    const response = await fetch(url);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toStrictEqual({
      autoUpdateCheck: false,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    });
  });

  it("PUTs a partial patch and echoes the merged result", async () => {
    const response = await putJson(url, { dismissedUpdateVersion: "9.9.9" });

    expect(await response.json()).toStrictEqual({
      autoUpdateCheck: true,
      dismissedUpdateVersion: "9.9.9",
      warnIfInstallIncomplete: true,
    });
    expect(readGlobalSettings().dismissedUpdateVersion).toBe("9.9.9");
  });

  it("PUTs autoUpdateCheck", async () => {
    const response = await putJson(url, { autoUpdateCheck: false });

    expect(await response.json()).toStrictEqual({
      autoUpdateCheck: false,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    });
    expect(readGlobalSettings().autoUpdateCheck).toBe(false);
  });

  it("400s a mistyped or unknown setting rather than silently ignoring it", async () => {
    const mistyped = await putJson(url, { autoUpdateCheck: "no" });
    const unknown = await putJson(url, { autoUpdateChekc: false });

    expect(mistyped.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(readGlobalSettings().autoUpdateCheck).toBe(true);
  });

  it("clears a dismissal with an explicit null", async () => {
    updateGlobalSettings({ dismissedUpdateVersion: "9.9.9" });

    const response = await putJson(url, { dismissedUpdateVersion: null });

    expect(await response.json()).toStrictEqual({
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    });
  });

  it("400s a mistyped dismissedUpdateVersion", async () => {
    const response = await putJson(url, { dismissedUpdateVersion: 42 });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "dismissedUpdateVersion must be a string or null",
    });
  });

  it("400s a request with no JSON object body", async () => {
    // No Content-Type, so express leaves req.body undefined; a bare JSON scalar
    // parses but isn't a patch.
    const noBody = await fetch(url, { method: "PUT" });
    const notAnObject = await putJson(url, "nope");

    expect(noBody.status).toBe(400);
    expect(notAnObject.status).toBe(400);
  });

  it("403s a cross-site write", async () => {
    const response = await putJson(
      url,
      { autoUpdateCheck: false },
      "https://evil.example",
    );

    expect(response.status).toBe(403);
    expect(readGlobalSettings().autoUpdateCheck).toBe(true);
  });

  it("hides the device's update notice when a version is dismissed", async () => {
    await putJson(url, { dismissedUpdateVersion: "9.9.9" });

    await vi.waitFor(() => {
      expect(Max.outlet).toHaveBeenCalledWith("config", "updateDismissed", 1);
    });
  });

  it("hides the device's update notice when update checking is turned off", async () => {
    await putJson(url, { autoUpdateCheck: false });

    await vi.waitFor(() => {
      expect(Max.outlet).toHaveBeenCalledWith("config", "updateDismissed", 1);
    });
  });

  it("leaves the device's update notice alone for other changes", async () => {
    await putJson(url, { autoUpdateCheck: true });
    await putJson(url, { dismissedUpdateVersion: null });

    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("PUTs the incomplete-installation warning, and re-checks the device's install notice", async () => {
    const response = await putJson(url, { warnIfInstallIncomplete: false });

    expect(await response.json()).toStrictEqual({
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: false,
    });
    expect(syncDeviceInstallNotice).toHaveBeenCalledTimes(1);
  });

  it("400s a mistyped warnIfInstallIncomplete", async () => {
    const response = await putJson(url, { warnIfInstallIncomplete: "no" });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "warnIfInstallIncomplete must be a boolean",
    });
  });

  it.each([
    { what: "a dismissed update", patch: { dismissedUpdateVersion: "9.9.9" } },
    { what: "update checks turned off", patch: { autoUpdateCheck: false } },
  ])(
    "re-checks the device's install notice for $what, since it gives way to the update notice",
    async ({ patch }) => {
      await putJson(url, patch);

      expect(syncDeviceInstallNotice).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves the install notice alone when update checks are turned on", async () => {
    await putJson(url, { autoUpdateCheck: true });

    expect(syncDeviceInstallNotice).not.toHaveBeenCalled();
  });
});
