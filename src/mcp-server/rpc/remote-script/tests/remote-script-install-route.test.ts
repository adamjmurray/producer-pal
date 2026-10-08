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
import { VERSION } from "#src/shared/config.ts";
import { MANAGE_ROUTES } from "#src/tools/core/helpers/manage-contract.ts";
import { findUserLibraryPath } from "../../../live-library/query/user-library-path.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import {
  installRemoteScript,
  remoteScriptPath,
} from "../install/remote-script-install.ts";
import { registerRemoteScriptInstallRoute } from "../install/remote-script-install-route.ts";
import { installRemoteScriptReply } from "../install/remote-script-install-reply.ts";
import { makeScratchUserLibrary } from "./remote-script-test-helpers.ts";

vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath: vi.fn(),
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
});

afterEach(() => {
  clearNodeRoutes();
  rmSync(library, { recursive: true, force: true });
});

/**
 * @param args - The route's args
 * @returns What the route answered
 */
async function install(args: object = {}): Promise<unknown> {
  const response = await dispatchNodeRoute(MANAGE_ROUTES.install, args);

  expect(response.success).toBe(true);

  return (response as { result: unknown }).result;
}

describe("manage.installRemoteScript", () => {
  it("installs into the User Library it finds and reports the version and path", async () => {
    const path = remoteScriptPath(library);

    expect(await install()).toStrictEqual({
      installed: true,
      version: VERSION,
      path,
    });
    expect(existsSync(join(path, "__init__.py"))).toBe(true);
  });

  it("answers the same when called directly, as the portal does", async () => {
    clearNodeRoutes();

    expect(await installRemoteScriptReply(` ${library} `)).toStrictEqual({
      installed: true,
      version: VERSION,
      path: remoteScriptPath(library),
    });
    expect(await installRemoteScriptReply()).toStrictEqual({
      installed: true,
      version: VERSION,
      path: remoteScriptPath(library),
    });
  });

  it("installs into the User Library it is given, without looking", async () => {
    const result = await install({ userLibrary: ` ${library} ` });

    expect(result).toHaveProperty("installed", true);
    expect(findUserLibraryPath).not.toHaveBeenCalled();
  });

  it("refuses, saying to ask for the path, when none is found or given", async () => {
    vi.mocked(findUserLibraryPath).mockResolvedValue(null);

    const result = await install();

    expect(result).toStrictEqual({
      installed: false,
      error: expect.stringMatching(
        /^couldn't find Live's User Library, so nothing was installed\. Ask the user .* pass it as userLibrary$/,
      ),
    });
  });

  it("refuses a given path that isn't a folder, and installs nothing", async () => {
    const result = await install({ userLibrary: join(library, "nope") });

    expect(result).toStrictEqual({
      installed: false,
      error: expect.stringContaining("nothing was installed"),
    });
    expect(existsSync(remoteScriptPath(library))).toBe(false);
  });

  it("refuses a relative path", async () => {
    expect(await install({ userLibrary: "Music/User Library" })).toStrictEqual({
      installed: false,
      error: expect.stringContaining("Not an absolute path"),
    });
  });

  it("says a write that failed partway left the old install as it was", async () => {
    const { path } = installRemoteScript(library);
    const parent = join(library, "Remote Scripts");

    writeFileSync(join(path, "marker.py"), "old install", "utf8");
    // Read-only parent: the new copy can't be written.
    chmodSync(parent, 0o500);

    let result: unknown;

    try {
      result = await install();
    } finally {
      chmodSync(parent, 0o700);
    }

    expect(result).toStrictEqual({
      installed: false,
      error: expect.stringMatching(
        /^the install failed \(.*\)\. Nothing half-written was kept, and any previous install is unchanged$/,
      ),
    });
    expect(readFileSync(join(path, "marker.py"), "utf8")).toBe("old install");
  });

  it("says when the old install was moved aside and couldn't be put back", async () => {
    mkdirSync(join(library, "Remote Scripts"), { recursive: true });
    vi.mocked(installRemoteScript).mockImplementationOnce(() => {
      throw new Error("EPERM: rename x (old install left at /lib/old)");
    });

    expect(await install()).toStrictEqual({
      installed: false,
      error:
        "the install failed (EPERM: rename x (old install left at /lib/old)). The previous copy was moved aside and not put back, so the remote script is missing until you run the install again",
    });
  });
});
