// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformSupport } from "#src/test/fixtures/platform-support.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  PLUGIN_HOST_WRAPPERS,
  pluginHostPath,
} from "#src/portal/setup/plugin-host/plugin-host-wrappers.ts";
import { MANAGE_ROUTES } from "#src/tools/core/helpers/manage-contract.ts";
import { findUserLibraryPath } from "../../../live-library/query/user-library-path.ts";
import { syncDeviceInstallNotice } from "../../device-install/device-install-notice.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import {
  installRemoteScript,
  remoteScriptPath,
} from "../install/remote-script-install.ts";
import { registerRemoteScriptInstallRoute } from "../install/remote-script-install-route.ts";
import {
  ASK_FOR_LIBRARY,
  installRemoteScriptPart,
} from "../install/remote-script-install-reply.ts";
import { installRunningDevicePart } from "../../device-install/running-device-install-part.ts";
import { makeScratchUserLibrary } from "./remote-script-test-helpers.ts";

vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath: vi.fn(),
}));

// Covered by its own tests; here only whether the route asks for it.
vi.mock(import("../../device-install/device-install-notice.ts"), () => ({
  syncDeviceInstallNotice: vi.fn(async () => {}),
}));

// Covered by its own tests; here only that the route installs the device too.
vi.mock(import("../../device-install/running-device-install-part.ts"), () => ({
  installRunningDevicePart: vi.fn(),
}));

// Real by default; a test can make the swap fail the way a stuck one does.
vi.mock(
  import("../install/remote-script-install.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      installRemoteScript: vi.fn(actual.installRemoteScript),
    };
  },
);

let library: string;

beforeEach(() => {
  registerRemoteScriptInstallRoute();
  library = makeScratchUserLibrary("install-route");
  vi.mocked(findUserLibraryPath).mockResolvedValue(library);
  vi.mocked(syncDeviceInstallNotice).mockClear();
  vi.mocked(installRunningDevicePart).mockReset();
  vi.mocked(installRunningDevicePart).mockImplementation((to) => ({
    status: "installed",
    path: join(to, "Producer_Pal.amxd"),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearNodeRoutes();
  rmSync(library, { recursive: true, force: true });
});

/** What the wrappers report when both were just installed into the library. */
function wrappersInstalled(): unknown {
  return PLUGIN_HOST_WRAPPERS.map((wrapper) => ({
    name: wrapper.name,
    status: "installed",
    path: pluginHostPath(library, wrapper),
  }));
}

/**
 * @param args - The route's args
 * @returns What the route answered
 */
async function install(args: object = {}): Promise<unknown> {
  const response = await dispatchNodeRoute(MANAGE_ROUTES.install, args);

  expect(response.success).toBe(true);

  return (response as { result: unknown }).result;
}

describe("manage.installProducerPal", () => {
  it("installs the script and the device into the User Library it finds", async () => {
    const path = remoteScriptPath(library);

    expect(await install()).toStrictEqual({
      ran: true,
      remoteScript: { status: "installed", version: VERSION, path },
      device: {
        status: "installed",
        path: join(library, "Producer_Pal.amxd"),
      },
      pluginHost: wrappersInstalled(),
    });
    expect(existsSync(join(path, "__init__.py"))).toBe(true);

    for (const wrapper of PLUGIN_HOST_WRAPPERS) {
      expect(existsSync(pluginHostPath(library, wrapper))).toBe(true);
    }

    expect(installRunningDevicePart).toHaveBeenCalledWith(library);
    // The device's "Finish installation" notice may be done with.
    expect(syncDeviceInstallNotice).toHaveBeenCalledTimes(1);
  });

  it("installs the script alone as the portal does", () => {
    expect(installRemoteScriptPart(library)).toStrictEqual({
      status: "installed",
      version: VERSION,
      path: remoteScriptPath(library),
    });
  });

  it("installs into the User Library it is given, without looking", async () => {
    const result = await install({ userLibrary: ` ${library} ` });

    expect(result).toHaveProperty("ran", true);
    expect(installRunningDevicePart).toHaveBeenCalledWith(library);
    expect(findUserLibraryPath).not.toHaveBeenCalled();
  });

  it("still installs the script when the device can't be, and says so", async () => {
    vi.mocked(installRunningDevicePart).mockReturnValue({
      ok: false,
      detail: "This is a development device.",
    });

    expect(await install()).toStrictEqual({
      ran: true,
      remoteScript: expect.objectContaining({ status: "installed" }),
      device: { ok: false, detail: "This is a development device." },
      pluginHost: wrappersInstalled(),
    });
    expect(existsSync(remoteScriptPath(library))).toBe(true);
  });

  it("still installs the device when the script can't be, and says so", async () => {
    vi.mocked(installRemoteScript).mockImplementationOnce(() => {
      throw new Error("EPERM: rename x");
    });

    expect(await install()).toStrictEqual({
      ran: true,
      remoteScript: {
        ok: false,
        detail: expect.stringContaining("install failed"),
      },
      device: expect.objectContaining({ status: "installed" }),
      pluginHost: wrappersInstalled(),
    });
  });

  it("reports a wrapper that can't be installed and still installs the rest", async () => {
    // A folder where the effect wrapper belongs can't be replaced as a file.
    const stuck = pluginHostPath(library, PLUGIN_HOST_WRAPPERS[0]);

    mkdirSync(stuck, { recursive: true });

    const result = (await install()) as {
      remoteScript: unknown;
      device: unknown;
      pluginHost: unknown[];
    };

    expect(result.remoteScript).toStrictEqual(
      expect.objectContaining({ status: "installed" }),
    );
    expect(result.device).toStrictEqual(
      expect.objectContaining({ status: "installed" }),
    );
    expect(result.pluginHost).toStrictEqual([
      {
        name: "PPal Plug-in Effect",
        ok: false,
        path: stuck,
        detail: expect.stringContaining("Couldn't install the wrapper"),
      },
      expect.objectContaining({
        name: "PPal Plug-in Instrument",
        status: "installed",
      }),
    ]);
  });

  it("still installs the wrappers when the device is kept", async () => {
    vi.mocked(installRunningDevicePart).mockReturnValue({
      status: "kept",
      path: "/d",
      detail: "newer",
    });

    expect(await install()).toStrictEqual(
      expect.objectContaining({
        device: { status: "kept", path: "/d", detail: "newer" },
        pluginHost: wrappersInstalled(),
      }),
    );
  });

  it("installs no wrappers and reports none in a build without hosting", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");

    const result = await install();

    expect(result).toHaveProperty("remoteScript.status", "installed");
    expect(result).not.toHaveProperty("pluginHost");
    expect(
      PLUGIN_HOST_WRAPPERS.some((wrapper) =>
        existsSync(pluginHostPath(library, wrapper)),
      ),
    ).toBe(false);
  });

  it("refuses, saying to ask for the path, when none is found or given", async () => {
    vi.mocked(findUserLibraryPath).mockResolvedValue(null);

    expect(await install()).toStrictEqual({
      ran: false,
      error: `couldn't find Live's User Library, so nothing was installed. ${ASK_FOR_LIBRARY}`,
    });
    expect(syncDeviceInstallNotice).not.toHaveBeenCalled();
    expect(installRunningDevicePart).not.toHaveBeenCalled();
  });

  it("refuses a given path that isn't a folder, and installs nothing", async () => {
    const result = await install({ userLibrary: join(library, "nope") });

    expect(result).toStrictEqual({
      ran: false,
      error: expect.stringContaining("nothing was installed"),
    });
    expect(existsSync(remoteScriptPath(library))).toBe(false);
    expect(installRunningDevicePart).not.toHaveBeenCalled();
  });

  it("refuses a relative path", async () => {
    expect(await install({ userLibrary: "Music/User Library" })).toStrictEqual({
      ran: false,
      error: expect.stringContaining("Not an absolute path"),
    });
  });
});

describe("installRemoteScriptPart", () => {
  it.skipIf(!platformSupport.fileModes)(
    "says a write that failed partway left the old install as it was",
    () => {
      const { path } = installRemoteScript(library);
      const parent = join(library, "Remote Scripts");

      writeFileSync(join(path, "marker.py"), "old install", "utf8");
      // Read-only parent: the new copy can't be written.
      chmodSync(parent, 0o500);

      let part: unknown;

      try {
        part = installRemoteScriptPart(library);
      } finally {
        chmodSync(parent, 0o700);
      }

      expect(part).toStrictEqual({
        ok: false,
        detail: expect.stringMatching(
          /^install failed \(.*\)\. Nothing half-written was kept, and any previous install is unchanged$/,
        ),
      });
      expect(readFileSync(join(path, "marker.py"), "utf8")).toBe("old install");
    },
  );

  it("says when the old install was moved aside and couldn't be put back", () => {
    mkdirSync(join(library, "Remote Scripts"), { recursive: true });
    vi.mocked(installRemoteScript).mockImplementationOnce(() => {
      throw new Error("EPERM: rename x (old install left at /lib/old)");
    });

    expect(installRemoteScriptPart(library)).toStrictEqual({
      ok: false,
      detail:
        "install failed (EPERM: rename x (old install left at /lib/old)). The previous copy was moved aside and not put back, so the remote script is missing until you run the install again",
    });
  });

  it("doesn't claim nothing was kept when the new copy couldn't be removed", () => {
    mkdirSync(join(library, "Remote Scripts"), { recursive: true });
    vi.mocked(installRemoteScript).mockImplementationOnce(() => {
      throw new Error("EPERM: rename x (new copy left at /lib/tmp)");
    });

    expect(installRemoteScriptPart(library)).toStrictEqual({
      ok: false,
      detail:
        "install failed (EPERM: rename x (new copy left at /lib/tmp)). Any previous install is unchanged",
    });
  });

  it("names a bad folder, saying nothing was installed", () => {
    expect(installRemoteScriptPart(join(library, "nope"))).toStrictEqual({
      ok: false,
      detail: expect.stringContaining("nothing was installed"),
    });
  });
});
