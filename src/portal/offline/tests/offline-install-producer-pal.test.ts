// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import { offlineManage } from "../offline-manage.ts";
import { type OfflineDeps } from "../offline-deps.ts";
import {
  copied,
  DEVICE_PATH,
} from "./offline-add-producer-pal-test-helpers.ts";
import { fakeOfflineDeps, noDevice, RUNNING } from "./offline-test-helpers.ts";

const LIBRARY = tmpdir();
const SCRIPT_PATH = "/lib/Remote Scripts/Producer_Pal";
const SCRIPT_OK: InstallPart = {
  status: "installed",
  version: VERSION,
  path: SCRIPT_PATH,
};

/**
 * @param overrides - What this test changes
 * @returns Dependencies where both installs work
 */
function installDeps(overrides: Partial<OfflineDeps> = {}): OfflineDeps {
  return fakeOfflineDeps({
    findUserLibrary: vi.fn(() => Promise.resolve(LIBRARY)),
    findBundledDevice: vi.fn(() => "/bundle/Producer_Pal.amxd"),
    installRemoteScript: vi.fn(() => SCRIPT_OK),
    installDevice: vi.fn(() => copied("installed")),
    ...overrides,
  });
}

/**
 * @param deps - The dependencies
 * @param args - Extra call arguments
 * @returns The response
 */
async function install(
  deps: OfflineDeps,
  args: Record<string, unknown> = {},
): Promise<McpResponse> {
  const response = await offlineManage(
    { action: "install-producer-pal", ...args },
    noDevice,
    deps,
  );

  if (response == null) {
    throw new Error("install-producer-pal gave no response");
  }

  return response;
}

/**
 * @param response - A tool response
 * @returns Its text
 */
function textOf(response: McpResponse): string {
  return response.content[0]?.text ?? "";
}

describe("offline install-producer-pal", () => {
  it("installs the remote script and the device, and reports each", async () => {
    const deps = installDeps();
    const response = await install(deps);

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toBe(
      `{remoteScript:{status:"installed",version:"${VERSION}",path:"${SCRIPT_PATH}"},device:{status:"installed",path:"${DEVICE_PATH}"},nextSteps:${JSON.stringify(
        `Tell the user to finish in Live: restart Live, then, on first install, choose "Producer Pal" as a Control Surface in Settings → Tempo & MIDI, with Input and Output left as None. It takes one free slot and no MIDI, so their other controllers keep working. Then call add-producer-pal (ask the user first). The device is in the User Library: the user can drag Producer Pal onto a MIDI track in Live right away, without the restart.`,
      )}}`,
    );
    expect(deps.installRemoteScript).toHaveBeenCalledWith(LIBRARY);
    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      "/bundle/Producer_Pal.amxd",
    );
  });

  it("installs the plug-in host wrappers into the same library and reports them", async () => {
    const parts = [
      { name: "PPal Plug-in Effect", status: "installed" as const, path: "/e" },
    ];
    const deps = installDeps({ installPluginHost: vi.fn(() => parts) });
    const text = textOf(await install(deps));

    expect(deps.installPluginHost).toHaveBeenCalledWith(LIBRARY);
    expect(text).toContain(
      'pluginHost:[{name:"PPal Plug-in Effect",status:"installed",path:"/e"}]',
    );
  });

  it("is not an error when a wrapper fails, and says to retry it", async () => {
    const response = await install(
      installDeps({
        installPluginHost: vi.fn(() => [
          {
            name: "PPal Plug-in Effect",
            ok: false as const,
            path: "/e",
            detail: "In use.",
          },
        ]),
      }),
    );

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toContain('remoteScript:{status:"installed"');
    expect(textOf(response)).toContain('device:{status:"installed"');
    expect(textOf(response)).toContain(
      "Plug-in hosting needs PPal Plug-in Effect",
    );
  });

  it("leaves pluginHost out when the build hosts no plug-ins", async () => {
    expect(textOf(await install(installDeps()))).not.toContain("pluginHost");
  });

  it("answers to the retired name exactly as to the new one", async () => {
    const answer = async (action: string): Promise<string> =>
      textOf(await install(installDeps(), { action }));

    expect(await answer("install-remote-script")).toBe(
      await answer("install-producer-pal"),
    );
  });

  it("uses the User Library the call gives, without looking", async () => {
    const deps = installDeps();

    await install(deps, { userLibrary: ` ${LIBRARY} ` });

    expect(deps.installRemoteScript).toHaveBeenCalledWith(LIBRARY);
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
  });

  it("says what an update did and which device it kept", async () => {
    const updated = await install(
      installDeps({
        installDevice: () => copied("updated", { detail: "Replaced it." }),
      }),
    );

    expect(textOf(updated)).toContain(
      'device:{status:"updated",path:"' +
        DEVICE_PATH +
        '",detail:"Replaced it."}',
    );

    const kept = await install(
      installDeps({
        installDevice: () =>
          copied("skipped", {
            previousVersion: "99.0.0",
            bundledVersion: "2.5.0",
          }),
      }),
    );

    expect(kept.isError).toBeUndefined();
    expect(textOf(kept)).toContain('device:{status:"kept"');
    expect(textOf(kept)).toContain(
      "left the installed device (99.0.0) as it is: it is newer than this portal's (2.5.0).",
    );
    expect(textOf(kept)).toContain(UPDATE_PORTAL_ADVICE);
  });

  it("says when the installed device is already current", async () => {
    const response = await install(
      installDeps({ installDevice: () => copied("current") }),
    );

    expect(textOf(response)).toContain('device:{status:"current"');
    expect(response.isError).toBeUndefined();
  });
});

describe("offline install-producer-pal when one install fails", () => {
  it("reports the remote script as installed and the device as failed", async () => {
    const deps = installDeps({
      installDevice: () =>
        copied("failed", { error: "EBUSY", detail: "Couldn't install." }),
    });
    const response = await install(deps);
    const text = textOf(response);

    expect(response.isError).toBeUndefined();
    expect(text).toContain('remoteScript:{status:"installed"');
    expect(text).toContain(
      'device:{ok:false,path:"' +
        DEVICE_PATH +
        '",detail:"Couldn\'t install. Cause: EBUSY."}',
    );
    expect(text).toContain(
      "Only the remote script was installed; the device was not (see device). Tell the user why, and to finish in Live:",
    );
    expect(text).toContain("which retries the device");
  });

  it("reports the device as failed when none shipped, pointing at the guide", async () => {
    const response = await install(
      installDeps({ findBundledDevice: () => null }),
    );

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toContain('remoteScript:{status:"installed"');
    expect(textOf(response)).toContain(
      "this Producer Pal install has no bundled device, so the device was not installed. Tell the user to install it by hand: https://producer-pal.org/installation",
    );
  });

  it("reports a copy that threw as a failed device", async () => {
    const response = await install(
      installDeps({
        installDevice: () => {
          throw new Error("The bundled device can't be read: gone");
        },
      }),
    );

    expect(textOf(response)).toContain(
      "The bundled device can't be read: gone. The device was not installed.",
    );
  });

  it("reports the device as installed and the remote script as failed", async () => {
    const deps = installDeps({
      installRemoteScript: () => ({
        ok: false,
        detail: "install failed (EACCES). Any previous install is unchanged",
      }),
    });
    const response = await install(deps);
    const text = textOf(response);

    expect(response.isError).toBeUndefined();
    expect(text).toContain('device:{status:"installed"');
    expect(text).toContain(
      'remoteScript:{ok:false,detail:"install failed (EACCES). Any previous install is unchanged"}',
    );
    expect(text).toContain(
      "Only the device was installed; the remote script was not (see remoteScript).",
    );
    expect(text).toContain(
      "the user can drag Producer Pal onto a MIDI track in Live right away",
    );
  });

  it("is an error naming both when neither installed", async () => {
    const response = await install(
      installDeps({
        installRemoteScript: () => ({ ok: false, detail: "no script." }),
        installDevice: () =>
          copied("failed", { error: "EBUSY", detail: "No device." }),
      }),
    );

    expect(response.isError).toBe(true);
    expect(textOf(response)).toBe(
      "Error: nothing was installed. Remote script: no script. Device: No device. Cause: EBUSY.",
    );
  });
});

describe("offline install-producer-pal picks the User Library as add does", () => {
  const named = mkdtempSync(join(tmpdir(), "ppal-install-named-"));
  const found = mkdtempSync(join(tmpdir(), "ppal-install-found-"));

  it("takes the one the call gives before the running script's", async () => {
    const deps = installDeps({
      ping: vi.fn(() => Promise.resolve({ ...RUNNING, userLibrary: named })),
    });

    await install(deps, { userLibrary: LIBRARY });

    expect(deps.installRemoteScript).toHaveBeenCalledWith(LIBRARY);
    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      expect.any(String),
    );
  });

  it("then the one the running remote script reports, without looking", async () => {
    const deps = installDeps({
      ping: vi.fn(() => Promise.resolve({ ...RUNNING, userLibrary: named })),
      findUserLibrary: vi.fn(() => Promise.resolve(found)),
    });

    await install(deps);

    expect(deps.installRemoteScript).toHaveBeenCalledWith(named);
    expect(deps.installDevice).toHaveBeenCalledWith(named, expect.any(String));
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
  });

  it("then the one Producer Pal finds", async () => {
    const deps = installDeps({
      ping: vi.fn(() => Promise.resolve(RUNNING)),
      findUserLibrary: vi.fn(() => Promise.resolve(found)),
    });

    await install(deps);

    expect(deps.installRemoteScript).toHaveBeenCalledWith(found);
    expect(deps.installDevice).toHaveBeenCalledWith(found, expect.any(String));
  });
});

describe("offline install-producer-pal without a usable User Library", () => {
  it("asks for the path when none is found, installing nothing", async () => {
    const deps = installDeps({
      findUserLibrary: vi.fn(() => Promise.resolve(null)),
    });
    const response = await install(deps);

    expect(response.isError).toBe(true);
    expect(textOf(response)).toBe(
      `Error: couldn't find Live's User Library, so nothing was installed. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.installRemoteScript).not.toHaveBeenCalled();
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("refuses a given path that isn't a folder, installing nothing", async () => {
    const deps = installDeps();
    const response = await install(deps, { userLibrary: "/no/such/folder" });

    expect(response.isError).toBe(true);
    expect(textOf(response)).toBe(
      `Error: Not a folder: /no/such/folder; nothing was installed. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.installRemoteScript).not.toHaveBeenCalled();
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("reports a lookup that threw as nothing installed", async () => {
    const response = await install(
      installDeps({
        findUserLibrary: () => Promise.reject(new Error("disk gone")),
      }),
    );

    expect(textOf(response)).toContain(
      "couldn't look up Live's User Library (disk gone), so nothing was installed.",
    );
  });
});
