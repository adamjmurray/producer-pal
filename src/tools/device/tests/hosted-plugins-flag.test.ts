// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// These read the flag when they load, so each is imported fresh with it off.
// Reads and writes are gated where a wrapper is detected, and tested there.
describe("a build without ENABLE_HOSTED_PLUGINS", () => {
  beforeAll(() => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");
    vi.resetModules();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("offers no `hosted` on ppal-create-device", async () => {
    const { toolDefCreateDevice } =
      await import("../create/create-device.def.ts");

    expect(toolDefCreateDevice.toolOptions.inputSchema).not.toHaveProperty(
      "hosted",
    );
  });

  it("doesn't mention hosted params on ppal-update-device", async () => {
    const { toolDefUpdateDevice } =
      await import("../update/update-device.def.ts");
    const { params } = toolDefUpdateDevice.toolOptions.inputSchema;

    expect(params?.description).not.toContain("hosted");
    expect(params?.description).toContain(
      "earlier one comes back with only a `detail`. For a Drum Rack,",
    );
  });

  it("keeps the native-only plug-in text in the Skills", async () => {
    const { devices } =
      await import("#src/skills/fragments/devices/devices.ts");

    expect(devices).not.toContain("hosted");
    expect(devices).toContain(
      "To make a plug-in's parameters controllable, the user maps them",
    );
  });

  it("keeps hosted plug-in params out of the automation Skill", async () => {
    const { automation, automationWrite } =
      await import("#src/skills/fragments/automation.ts");

    expect(automation).not.toContain("hosted");
    expect(automationWrite).not.toContain("hosted");
    expect(automationWrite).toContain(
      "never a display name; a session clip's `pan:` with nothing after clears just that one. Mixer `volume`",
    );
  });

  it("leaves ppal-plugin-host out of the opt-in tools", async () => {
    const { OPT_IN_TOOL_DEFS } =
      await import("#src/mcp-server/create-mcp-server.ts");

    expect(OPT_IN_TOOL_DEFS.map((def) => def.toolName)).toStrictEqual([
      "ppal-live-api",
    ]);
  });
});
