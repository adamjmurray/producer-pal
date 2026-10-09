// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Drives the real portal binary: spawns `npm/producer-pal-portal.js` and speaks
// MCP to it over stdio, the way Claude Desktop does. Nothing is mocked on the
// portal side — CLI flags are parsed by the shipped bundle, and the tool list
// comes back over the wire.

import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach } from "vitest";

const execFileAsync = promisify(execFile);

const PORTAL_BUNDLE = join(
  import.meta.dirname,
  "../../npm/producer-pal-portal.js",
);

/** How long a negative assertion waits before deciding nothing is coming. */
const SETTLE_MS = 250;

/** A running portal and the client talking to it. */
export interface PortalSession {
  /** The MCP client, connected over the portal's stdio. */
  client: Client;
  /** tools/list_changed notifications received so far. */
  toolListChanges: number;
  /** Kill the portal process. */
  stop: () => Promise<void>;
}

/** Anything {@link stopAfterEach} can clean up. */
export interface Stoppable {
  stop: () => Promise<void>;
}

/**
 * Spawn the portal and connect an MCP client to it.
 * @param origin - The device origin to point it at (MCP_SERVER_ORIGIN)
 * @param args - CLI flags, e.g. ["--tools", "clip"]
 * @param env - Extra environment, e.g. { SMALL_MODEL_MODE: "true" }
 * @param bundle - The portal script to run; defaults to the built one
 * @returns The connected session
 */
export async function startPortal(
  origin: string,
  args: string[] = [],
  env: Record<string, string> = {},
  bundle: string = portalBundle(),
): Promise<PortalSession> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle, ...args],
    env: portalEnv(origin, env),
    // The bridge writes a connect line to stderr; piping keeps it out of the
    // test report.
    stderr: "pipe",
  });
  const client = new Client({ name: "portal-e2e", version: "1.0.0" });
  const session: PortalSession = {
    client,
    toolListChanges: 0,
    stop: () => client.close(),
  };

  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    session.toolListChanges += 1;
  });

  await client.connect(transport);

  return session;
}

/**
 * A copy of the built portal in its own folder, so a device file beside it (or
 * the lack of one) is the test's to decide. The shipped portal looks for
 * Producer_Pal.amxd next to itself.
 * @param withDevice - Put a stand-in device file beside the copy
 * @param deviceVersion - The version the stand-in names, as a frozen device does
 * @returns The copy's path, and a stop that deletes it
 */
export function copyPortal(
  withDevice: boolean,
  deviceVersion?: string,
): {
  file: string;
  stop: () => Promise<void>;
} {
  const dir = mkdtempSync(join(tmpdir(), "ppal-portal-copy-"));
  // .mjs: the copy has no package.json saying the bundle is an ES module.
  const file = join(dir, "producer-pal-portal.mjs");

  copyFileSync(portalBundle(), file);

  if (withDevice) {
    writeFileSync(
      join(dir, "Producer_Pal.amxd"),
      deviceVersion == null
        ? "stand-in device"
        : `stand-in device const VERSION = "${deviceVersion}"`,
    );
  }

  return {
    file,
    stop: () => {
      rmSync(dir, { recursive: true, force: true });

      return Promise.resolve();
    },
  };
}

/**
 * Run the portal as a one-shot command, for the flags that print and exit
 * instead of starting a bridge.
 * @param origin - The device origin to point it at
 * @param args - CLI flags, e.g. ["--list-tools"]
 * @returns What it printed
 */
export async function runPortal(
  origin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(process.execPath, [portalBundle(), ...args], {
    env: portalEnv(origin),
  });
}

/**
 * The tool names the portal currently answers `tools/list` with.
 * @param session - A running portal session
 * @returns The names, sorted
 */
export async function listToolNames(session: PortalSession): Promise<string[]> {
  const { tools } = await session.client.listTools();

  return tools.map((tool) => tool.name).toSorted();
}

/**
 * Call a tool and read its text.
 * @param session - A running portal session
 * @param name - The tool
 * @param args - Its arguments
 * @returns The first text block, and whether the call was an error
 */
export async function callToolText(
  session: PortalSession,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean | undefined }> {
  const result = await session.client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const first: unknown = content.find(
    (item: { type?: unknown }) => item.type === "text",
  );

  return {
    text: textOf(first),
    isError: result.isError === true ? true : undefined,
  };
}

/**
 * Register portals and devices for teardown. Call once at module level, then
 * pass each one to the returned function as you start it.
 * @returns Registers a resource and hands it back
 */
export function stopAfterEach(): <T extends Stoppable>(resource: T) => T {
  const started: Stoppable[] = [];

  afterEach(async () => {
    // Newest first: the portal goes before the device it is talking to.
    for (const resource of started.splice(0).toReversed())
      await resource.stop();
  });

  return <T extends Stoppable>(resource: T): T => {
    started.push(resource);

    return resource;
  };
}

/**
 * Temp folders that are deleted after each test. Call once at module level.
 * @returns Makes a folder
 */
export function tempFolders(): () => string {
  const made: string[] = [];

  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true });
  });

  return () => {
    const dir = mkdtempSync(join(tmpdir(), "ppal-portal-e2e-"));

    made.push(dir);

    return dir;
  };
}

/**
 * Wait long enough that an expected-absent notification would have arrived.
 * Only for negative assertions — a positive one polls instead.
 */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

// --- Helpers below main exports ---

/**
 * @param block - A content block of a tool result
 * @returns Its text, or "" when it has none
 */
function textOf(block: unknown): string {
  return block != null &&
    typeof block === "object" &&
    "text" in block &&
    typeof block.text === "string"
    ? block.text
    : "";
}

/**
 * The built portal, or a readable error when the build hasn't been run.
 * @returns Path to the portal bundle
 */
function portalBundle(): string {
  if (!existsSync(PORTAL_BUNDLE)) {
    throw new Error(
      `Portal bundle not found at ${PORTAL_BUNDLE}. Run \`npm run build\` first.`,
    );
  }

  return PORTAL_BUNDLE;
}

/**
 * The portal's environment: the SDK's portable default plus the device origin.
 * Deliberately not the test process's own env — the portal reads its settings
 * from there, and inheriting would let a developer's shell change the result.
 * @param origin - The device origin
 * @param extra - Setting env vars the test wants
 * @returns The child environment
 */
function portalEnv(
  origin: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return { ...getDefaultEnvironment(), MCP_SERVER_ORIGIN: origin, ...extra };
}
