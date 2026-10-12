// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The device installing itself into the User Library (/device-install). The
 * e2e Live Set loads the UNFROZEN development device from max-for-live-device/,
 * so this covers what a real Live can prove: V8 reports the device's file path
 * to Node, and the server refuses to copy a device that isn't frozen.
 *
 * Run with: npm run e2e:mcp -- control/ppal-device-install
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONFIG_URL, setupMcpTestContext, sleep } from "../mcp-test-helpers.ts";

const DEVICE_URL = CONFIG_URL.replace("/config", "/device-install");
const REPORT_TIMEOUT_MS = 30_000;

interface DeviceInstallStatus {
  source: string | null;
  problem: string | null;
  userLibrary: string | null;
  path: string | null;
  state: string | null;
  otherCopies: string[];
}

/**
 * Read the status, waiting for the device to report where its file is: Node
 * asks when it starts, and that is some time after the Set opens.
 *
 * @returns The status once `source` is known
 */
async function statusWithSource(): Promise<DeviceInstallStatus> {
  const deadline = Date.now() + REPORT_TIMEOUT_MS;

  for (;;) {
    const response = await fetch(DEVICE_URL);
    const status = (await response.json()) as DeviceInstallStatus;

    if (status.source != null || Date.now() > deadline) {
      return status;
    }

    await sleep(500);
  }
}

describe("device self-install (unfrozen development device)", () => {
  setupMcpTestContext({ once: true });

  let scratchLibrary: string;

  beforeAll(() => {
    scratchLibrary = mkdtempSync(join(tmpdir(), "ppal-e2e-user-library-"));
  });

  afterAll(() => {
    rmSync(scratchLibrary, { recursive: true, force: true });
  });

  it("reports the device's own file, and says it can't be copied", async () => {
    const response = await fetch(DEVICE_URL);

    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const status = await statusWithSource();

    // Only the project-relative tail: the absolute path is machine-specific.
    expect(status.source).toMatch(
      /max-for-live-device[\\/]Producer_Pal\.amxd$/,
    );
    expect(status.problem).toBe("not-frozen");
    expect(status.state).toBeNull();
    expect(status.path).toBeNull();
  });

  it("refuses to install it, and writes nothing", async () => {
    await statusWithSource();

    const response = await fetch(`${DEVICE_URL}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLibrary: scratchLibrary }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toContain("development device");
    expect(readdirSync(scratchLibrary)).toStrictEqual([]);
  });
});
