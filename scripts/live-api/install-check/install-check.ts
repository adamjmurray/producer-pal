// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The MCP e2e suite's global setup: before any test runs, check that what Live
 * will load came from this checkout. A mismatch fails tests that look like
 * real bugs, or passes them against code that doesn't ship.
 *
 * Checks the User Library's remote script and plug-in wrappers match this
 * checkout, as does the remote script a running Live loaded. The device is only
 * checked to be a debug build, not a current one. The test Sets load the repo's
 * own device, so the User Library's device copy doesn't matter.
 *
 * Skip with E2E_INSTALL_CHECK=false, to test a different build on purpose.
 * Skipped when MCP_URL names another machine: nothing here is what it loads.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { GEN_UI_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts";
import { installedRemoteScriptBuild } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-build.ts";
import { readRemoteScriptSource } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-source.ts";
import {
  type RemoteScriptPing,
  remoteScriptPing,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import {
  installRemoteScript,
  remoteScriptPath,
} from "#src/mcp-server/rpc/remote-script/install/remote-script-install.ts";
import { pluginHostStatus } from "#src/portal/setup/plugin-host/plugin-host-install.ts";
import {
  pluginHostSourceDir,
  readPluginHostSource,
} from "#src/portal/setup/plugin-host/plugin-host-source.ts";
import { isLoopbackHost } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { addReloadRoute } from "../hot-reload/add-reload-route.ts";
import { resolveInstallLibrary } from "../install/helpers/install-library.ts";
import { addProbeRoute } from "../python-probe/add-probe-route.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const SCRIPT_SOURCE = join(REPO_ROOT, "remote-script", "Producer_Pal");

/** Only a debug build carries this tool, and the hosted plug-in tests use it. */
const DEBUG_ONLY_TOOL = '"ppal-plugin-host"';

const FIX_SCRIPT = "npm run install:remote-script -- --probe --reload";

/** What the check reads, replaced in tests. */
export interface InstallCheckDeps {
  repoRoot: string;
  /** The User Library path, or throws why there isn't one */
  userLibrary: () => Promise<string>;
  ping: () => Promise<RemoteScriptPing>;
  /** False when the run skips remote script tests (E2E_REMOTE_SCRIPT=false) */
  remoteScript: boolean;
}

/**
 * Find every way the installed pieces differ from this checkout.
 *
 * @param deps - What to read; defaults to the real repo, library and Live
 * @returns One line per problem, each saying how to fix it; empty when all match
 */
export async function installCheck(
  deps: InstallCheckDeps = defaultDeps(),
): Promise<string[]> {
  const problems = deviceProblems(deps.repoRoot);

  if (!deps.remoteScript) {
    return problems;
  }

  let userLibrary: string;

  try {
    userLibrary = await deps.userLibrary();
  } catch (error) {
    return [...problems, errorMessage(error)];
  }

  return [
    ...problems,
    ...(await remoteScriptProblems(userLibrary, deps.ping)),
    ...wrapperProblems(userLibrary, deps.repoRoot),
  ];
}

/**
 * Vitest global setup: throw when anything is off, so no test runs.
 */
export default async function setup(): Promise<void> {
  if (process.env.E2E_INSTALL_CHECK === "false" || isRemoteMcp()) {
    return;
  }

  const problems = await installCheck();

  if (problems.length > 0) {
    throw new Error(
      [
        "What Live will load doesn't match this checkout:",
        ...problems.map((problem) => `- ${problem}`),
        "To test a different build on purpose, set E2E_INSTALL_CHECK=false.",
      ].join("\n"),
    );
  }
}

/**
 * The real repo, User Library and Live, as the run's environment sets them.
 *
 * @returns The deps
 */
function defaultDeps(): InstallCheckDeps {
  return {
    repoRoot: REPO_ROOT,
    userLibrary: async () => {
      // The installers read .env; the e2e run doesn't, so read it here too.
      const { path } = await resolveInstallLibrary(
        process.env.ABLETON_USER_LIBRARY ?? dotEnv().ABLETON_USER_LIBRARY,
      );

      return path;
    },
    ping: remoteScriptPing,
    remoteScript: process.env.E2E_REMOTE_SCRIPT !== "false",
  };
}

/**
 * @param repoRoot - The checkout
 * @returns Why the device bundle won't do, if it won't
 */
function deviceProblems(repoRoot: string): string[] {
  const bundle = join(repoRoot, "max-for-live-device", "mcp-server.mjs");

  if (!existsSync(bundle)) {
    return ["No device build. Run `npm run build:debug`."];
  }

  if (!readFileSync(bundle, "utf8").includes(DEBUG_ONLY_TOOL)) {
    return [
      "The device is a release build, without the debug tools the tests use. Run `npm run build:debug`.",
    ];
  }

  return [];
}

/**
 * Compare the installed remote script with what the dev installer would write
 * now, and the one a running Live loaded with the installed one.
 *
 * @param userLibrary - The User Library Live uses
 * @param ping - Asks the running Live's script
 * @returns Problems, with how to fix each
 */
async function remoteScriptProblems(
  userLibrary: string,
  ping: () => Promise<RemoteScriptPing>,
): Promise<string[]> {
  const installedPath = remoteScriptPath(userLibrary);
  const installed = installedRemoteScriptBuild(installedPath);

  if (installed == null || !existsSync(join(installedPath, "__init__.py"))) {
    return [`No remote script in ${userLibrary}. Run \`${FIX_SCRIPT}\`.`];
  }

  const expected = expectedRemoteScriptBuild({
    probe: existsSync(join(installedPath, "probe.py")),
    genUi: GEN_UI_REMOTE_SCRIPT_FILES.some((name) =>
      existsSync(join(installedPath, name)),
    ),
  });

  if (installed !== expected) {
    return [
      `The remote script in ${installedPath} doesn't match this checkout. Run \`${FIX_SCRIPT}\`.`,
    ];
  }

  const running = await ping();

  // Not running: the tests start Live, which loads the files just checked.
  if (running.running && running.scriptBuild !== installed) {
    return [
      `Live is running a different copy of the remote script than the one installed. Run \`${FIX_SCRIPT}\`, or restart Live.`,
    ];
  }

  return [];
}

/**
 * The build ID the dev installer would produce from this checkout, found by
 * installing into a throwaway User Library. Probe routes and gen-UI files
 * follow the installed copy, since install flags choose them.
 *
 * @param options - What the installed copy has
 * @param options.probe - The dev-only /probe and /reload routes
 * @param options.genUi - The experimental generative UI's files
 * @returns The build ID
 */
function expectedRemoteScriptBuild(options: {
  probe: boolean;
  genUi: boolean;
}): string | null {
  const library = mkdtempSync(join(tmpdir(), "ppal-install-check-"));

  try {
    const { path } = installRemoteScript(library, "");
    const source = readRemoteScriptSource(SCRIPT_SOURCE);

    for (const name of GEN_UI_REMOTE_SCRIPT_FILES) {
      rmSync(join(path, name), { force: true });

      if (options.genUi) {
        writeFileSync(join(path, name), source[name] ?? "");
      }
    }

    if (options.probe) {
      addProbeRoute(path);
      addReloadRoute(path);
    }

    return installedRemoteScriptBuild(path);
  } finally {
    rmSync(library, { recursive: true, force: true });
  }
}

/**
 * @param userLibrary - The User Library Live uses
 * @param repoRoot - The checkout
 * @returns One problem naming the wrappers that differ, or none
 */
function wrapperProblems(userLibrary: string, repoRoot: string): string[] {
  const source = readPluginHostSource(pluginHostSourceDir(repoRoot));
  const off = pluginHostStatus(userLibrary, source).filter(
    ({ state }) => state !== "current",
  );

  if (off.length === 0) {
    return [];
  }

  const names = off.map(({ name, state }) => `${name} (${state})`).join(", ");

  return [
    `Plug-in wrappers don't match this checkout: ${names}. Run \`npm run install:plugin-host\`.`,
  ];
}

/** @returns Whether MCP_URL names a server on another machine */
function isRemoteMcp(): boolean {
  const url = process.env.MCP_URL;

  return url != null && url !== "" && !isLoopbackHost(new URL(url).host);
}

/** @returns The repo's .env values, or none when there's no .env */
function dotEnv(): Record<string, string | undefined> {
  const path = join(REPO_ROOT, ".env");

  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}
