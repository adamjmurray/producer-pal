// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// --tools / --disable-tools, driven through the shipped portal binary. Unit
// tests already cover how names and group aliases resolve; what only a real
// process shows is the two places that resolution has to land — the header every
// request carries to the device, and the offline list the portal serves on its
// own.
//
// Run with: npm run e2e:portal

import { describe, expect, it } from "vitest";
import {
  listToolNames,
  runPortal,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import {
  createStubDevice,
  DEVICE_TOOL,
  DEVICE_TOOL_REPLY,
  type StubDevice,
} from "../stub-device";

const track = stopAfterEach();

const CLIP_TOOLS = [
  "ppal-connect",
  "ppal-create-clip",
  "ppal-read-clip",
  "ppal-update-clip",
];

describe("--tools", () => {
  it("narrows the offline fallback list to the requested group", async () => {
    const device = track(await createStubDevice({ online: false }));
    const portal = track(await startPortal(device.origin, ["--tools", "clip"]));

    // The whitelist reaches the offline list too, so a client that lists before
    // Live is up doesn't cache tools this session was never going to have.
    // ppal-connect survives a whitelist that never asked for it — without the
    // entry point an MCP client has no way in.
    expect(await listToolNames(portal)).toStrictEqual(CLIP_TOOLS);
  });

  it("sends the complement to the device and serves what comes back", async () => {
    const device = track(await createStubDevice());
    const portal = track(await startPortal(device.origin, ["--tools", "clip"]));

    expect(await listToolNames(portal)).toStrictEqual([DEVICE_TOOL]);

    // A whitelist travels as its complement, because the device only ever
    // subtracts — and the entry point is not in it.
    const withheld = headerFor(device, "tools/list").split(",");

    expect(withheld).toContain("ppal-read-track");
    expect(withheld).toContain("ppal-live-api");
    expect(withheld).not.toContain("ppal-read-clip");
    expect(withheld).not.toContain("ppal-connect");
  });
});

describe("--disable-tools", () => {
  it("expands a group, forwards an unknown name, and rides every request", async () => {
    const device = track(await createStubDevice());
    const portal = track(
      await startPortal(device.origin, ["--disable-tools", "device,nonesuch"]),
    );

    const result = await portal.client.callTool({
      name: DEVICE_TOOL,
      arguments: {},
    });

    expect(JSON.stringify(result)).toContain(DEVICE_TOOL_REPLY);

    // Known names expand and keep catalog order; an unrecognized one is passed
    // to the device rather than dropped, so a cached portal can still withhold a
    // tool it has never heard of. Tool calls carry the header too — withholding
    // a tool the client can't see still has to hold if it asks for it anyway.
    const expected =
      "ppal-read-device,ppal-create-device,ppal-update-device,ppal-nonesuch";

    expect(headerFor(device, "initialize")).toBe(expected);
    expect(headerFor(device, "tools/call")).toBe(expected);
  });

  it("sends no header at all when nothing is withheld", async () => {
    const device = track(await createStubDevice());
    const portal = track(await startPortal(device.origin));

    await listToolNames(portal);

    expect(headerFor(device, "tools/list")).toBe("");
  });
});

describe("--list-tools", () => {
  it("prints the portal's own catalog when the device is unreachable", async () => {
    const device = track(await createStubDevice({ online: false }));
    const { stdout } = await runPortal(device.origin, [
      "--list-tools",
      "--tools",
      "clip",
    ]);

    expect(stdout).toContain("Could not reach the device at");
    expect(listedTools(stdout)).toStrictEqual(CLIP_TOOLS);
  });

  it("asks the device what it offers when one is running", async () => {
    const device = track(await createStubDevice());
    const { stdout } = await runPortal(device.origin, ["--list-tools"]);

    // Only the device knows its own Setup-tab toggles and any tool newer than
    // this portal build, so a reachable device is the better answer.
    expect(stdout).toContain("Available now (1):");
    expect(listedTools(stdout)).toStrictEqual([DEVICE_TOOL]);
  });
});

/**
 * The disabled-tools header the device saw on a given request.
 * @param device - The stub device
 * @param method - The JSON-RPC method to look for
 * @returns The header value, or "" when the portal sent none
 */
function headerFor(device: StubDevice, method: string): string {
  const request = device.requests.find((r) => r.method === method);

  expect(request, `no ${method} request reached the device`).toBeDefined();

  return request?.disabledTools ?? "";
}

/**
 * The tool names in `--list-tools` output. The group table above them also names
 * tools, several per line, so only the one-name lines count.
 * @param stdout - What the portal printed
 * @returns The listed tool names
 */
function listedTools(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => /^ {2}(ppal-\S+)$/.exec(line)?.[1])
    .filter((name) => name != null);
}
