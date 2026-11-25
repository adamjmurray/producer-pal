// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEN_UI_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts";
import { installedRemoteScriptBuild } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-build.ts";
import { readRemoteScriptSource } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-source.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { installRemoteScript } from "#src/mcp-server/rpc/remote-script/install/remote-script-install.ts";
import { installPluginHostWrappers } from "#src/portal/setup/plugin-host/plugin-host-install.ts";
import { readPluginHostSource } from "#src/portal/setup/plugin-host/plugin-host-source.ts";
import { addReloadRoute } from "../hot-reload/add-reload-route.ts";
import { addProbeRoute } from "../python-probe/add-probe-route.ts";
import setup, { type InstallCheckDeps, installCheck } from "./install-check.ts";

const SCRIPT_SOURCE = join(
  import.meta.dirname,
  "../../../remote-script/Producer_Pal",
);

const NOT_RUNNING: RemoteScriptPing = {
  running: false,
  liveVersion: null,
  scriptVersion: null,
  scriptBuild: null,
  scriptCommit: null,
  userLibrary: null,
  otherOnPort: null,
};

let root: string;
let repo: string;
let library: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "install-check-test-"));
  repo = join(root, "repo");
  library = join(root, "library");
  mkdirSync(join(repo, "max-for-live-device", "plugin-host"), {
    recursive: true,
  });
  mkdirSync(library);
  writeBundle('defineTool("ppal-plugin-host", {})');

  for (const name of ["PPal Plug-in Effect", "PPal Plug-in Instrument"]) {
    writeFileSync(join(wrapperDir(), `${name}.amxd`), `${name} bytes`);
  }

  installPluginHostWrappers(library, readPluginHostSource(wrapperDir()));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("installCheck", () => {
  it("finds nothing when every piece matches", async () => {
    installRemoteScript(library, "");

    expect(await installCheck(deps())).toStrictEqual([]);
  });

  it("accepts a dev install with the probe routes", async () => {
    const { path } = installRemoteScript(library, "1a2b3c4");

    addProbeRoute(path);
    addReloadRoute(path);

    expect(await installCheck(deps())).toStrictEqual([]);
  });

  it("accepts an install with the gen-UI files", async () => {
    const { path } = installRemoteScript(library, "");
    const source = readRemoteScriptSource(SCRIPT_SOURCE);

    for (const name of GEN_UI_REMOTE_SCRIPT_FILES) {
      writeFileSync(join(path, name), source[name] ?? "");
    }

    expect(await installCheck(deps())).toStrictEqual([]);
  });

  it("asks for a debug build when there is no device build", async () => {
    installRemoteScript(library, "");
    rmSync(join(repo, "max-for-live-device", "mcp-server.mjs"));

    expect(await installCheck(deps())).toStrictEqual([
      "No device build. Run `npm run build:debug`.",
    ]);
  });

  it("refuses a release build", async () => {
    installRemoteScript(library, "");
    writeBundle("a release build");

    expect(await installCheck(deps())).toStrictEqual([
      expect.stringContaining("The device is a release build"),
    ]);
  });

  it("checks only the device when the run skips the remote script", async () => {
    const userLibrary = vi.fn(async () => library);

    writeBundle("a release build");

    expect(
      await installCheck(deps({ userLibrary, remoteScript: false })),
    ).toHaveLength(1);
    expect(userLibrary).not.toHaveBeenCalled();
  });

  it("says why there's no User Library", async () => {
    const userLibrary = async (): Promise<string> => {
      throw new Error("Couldn't find your Ableton User Library.");
    };

    expect(await installCheck(deps({ userLibrary }))).toStrictEqual([
      "Couldn't find your Ableton User Library.",
    ]);
  });

  it("asks for an install when there's no remote script", async () => {
    expect(await installCheck(deps())).toStrictEqual([
      expect.stringContaining("No remote script in"),
    ]);
  });

  it("flags a remote script from another checkout", async () => {
    const { path } = installRemoteScript(library, "");

    appendFileSync(join(path, "routes.py"), "\n# from another branch\n");

    expect(await installCheck(deps())).toStrictEqual([
      expect.stringContaining("doesn't match this checkout"),
    ]);
  });

  it("flags a running Live that loaded a different copy", async () => {
    installRemoteScript(library, "");

    const ping = async (): Promise<RemoteScriptPing> => ({
      ...NOT_RUNNING,
      running: true,
      scriptBuild: "an older build",
    });

    expect(await installCheck(deps({ ping }))).toStrictEqual([
      expect.stringContaining("Live is running a different copy"),
    ]);
  });

  it("flags a running Live whose script reports no build", async () => {
    installRemoteScript(library, "");

    const ping = async (): Promise<RemoteScriptPing> => ({
      ...NOT_RUNNING,
      running: true,
    });

    expect(await installCheck(deps({ ping }))).toStrictEqual([
      expect.stringContaining("Live is running a different copy"),
    ]);
  });

  it("accepts a running Live that loaded the installed copy", async () => {
    const { path } = installRemoteScript(library, "");
    const ping = async (): Promise<RemoteScriptPing> => ({
      ...NOT_RUNNING,
      running: true,
      scriptBuild: installedRemoteScriptBuild(path),
    });

    expect(await installCheck(deps({ ping }))).toStrictEqual([]);
  });

  it("names each wrapper that differs or is missing", async () => {
    installRemoteScript(library, "");
    writeFileSync(join(wrapperDir(), "PPal Plug-in Effect.amxd"), "newer");
    rmSync(
      join(
        library,
        "Presets/Instruments/Max Instrument/PPal Plug-in Instrument.amxd",
      ),
    );

    expect(await installCheck(deps())).toStrictEqual([
      "Plug-in wrappers don't match this checkout: PPal Plug-in Effect (differs), PPal Plug-in Instrument (missing). Run `npm run install:plugin-host`.",
    ]);
  });
});

describe("setup", () => {
  it("checks nothing when E2E_INSTALL_CHECK=false", async () => {
    vi.stubEnv("E2E_INSTALL_CHECK", "false");

    await expect(setup()).resolves.toBeUndefined();
  });

  it("checks nothing when MCP_URL names another machine", async () => {
    vi.stubEnv("MCP_URL", "http://192.168.1.100:3350/mcp");

    await expect(setup()).resolves.toBeUndefined();
  });
});

/**
 * @param overrides - Deps to replace
 * @returns Deps reading the temp repo and library, with Live not running
 */
function deps(overrides: Partial<InstallCheckDeps> = {}): InstallCheckDeps {
  return {
    repoRoot: repo,
    userLibrary: async () => library,
    ping: async () => NOT_RUNNING,
    remoteScript: true,
    ...overrides,
  };
}

/** @returns The temp repo's wrapper source folder */
function wrapperDir(): string {
  return join(repo, "max-for-live-device", "plugin-host");
}

/** @param contents - What the device bundle holds */
function writeBundle(contents: string): void {
  writeFileSync(join(repo, "max-for-live-device", "mcp-server.mjs"), contents);
}
