// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { projectContextSidecarPath } from "../../helpers/project-context-backup/project-context-backup-store.ts";
import { TOOL_NAMES } from "../../create-mcp-server.ts";
import { dispatchNodeRoute } from "../config-dir-test-helpers.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

describe("MCP Express App - Config", () => {
  const appState = setupExpressAppServer({
    enableDevFeatures: true,
    enableLiveApi: true,
  });

  describe("Config Endpoints", () => {
    let configUrl: string;

    beforeAll(() => {
      configUrl = appState.serverUrl.replace("/mcp", "/config");
    });

    it("should return current config on GET /config", async () => {
      const response = await fetch(configUrl);

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config).toStrictEqual({
        liveApiEnabled: true,
        liveApiForcedOn: false,
        projectContext: expect.any(String),
        smallModelMode: expect.any(Boolean),
        notation: expect.any(String),
        jsonOutput: expect.any(Boolean),
        sampleFolder: expect.any(String),
        tools: expect.any(Array),
      });
    });

    it("should update notation on POST /config and ignore invalid values", async () => {
      const initialResponse = await fetch(configUrl);
      const initialConfig = await initialResponse.json();

      const response = await appState.postConfig({ notation: "midi-json" });

      expect(response.status).toBe(200);
      const updatedConfig = await response.json();

      expect(updatedConfig.notation).toBe("midi-json");

      // Invalid values are ignored, leaving the current setting intact
      const invalidResponse = await appState.postConfig({
        notation: "not-a-notation",
      });
      const invalidConfig = await invalidResponse.json();

      expect(invalidConfig.notation).toBe("midi-json");

      // Restore
      await appState.postConfig({ notation: initialConfig.notation });
    });

    it("should update config on POST /config", async () => {
      // First, get current config
      const initialResponse = await fetch(configUrl);
      const initialConfig = await initialResponse.json();

      // Update with new values
      const response = await appState.postConfig({
        smallModelMode: true,
        jsonOutput: true,
      });

      expect(response.status).toBe(200);
      const updatedConfig = await response.json();

      expect(updatedConfig.smallModelMode).toBe(true);
      expect(updatedConfig.jsonOutput).toBe(true);

      // Restore original values
      await appState.postConfig({
        smallModelMode: initialConfig.smallModelMode,
        jsonOutput: initialConfig.jsonOutput,
      });
    });

    it("should support partial config updates", async () => {
      // Get current config
      const getResponse = await fetch(configUrl);
      const before = await getResponse.json();

      // Only update sampleFolder
      const response = await appState.postConfig({
        sampleFolder: "/tmp/partial-test",
      });

      expect(response.status).toBe(200);
      const after = await response.json();

      expect(after.sampleFolder).toBe("/tmp/partial-test");
      // Other values should remain unchanged
      expect(after.smallModelMode).toBe(before.smallModelMode);
      expect(after.jsonOutput).toBe(before.jsonOutput);

      // Restore
      await appState.postConfig({ sampleFolder: before.sampleFolder });
    });

    it("should update projectContext string", async () => {
      const testNotes = "Test memory content";

      const response = await appState.postConfig({ projectContext: testNotes });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.projectContext).toBe(testNotes);

      // Clear notes
      await appState.postConfig({ projectContext: "" });
    });

    it("restores the on-disk backup into config on projectContext.sync (device upgrade)", async () => {
      const projectDir = mkdtempSync(join(tmpdir(), "ppal-proj-"));
      const liveSetPath = join(projectDir, "MySong.als");

      try {
        // Upgraded device: the param is empty but a sidecar holds the backup.
        writeFileSync(
          projectContextSidecarPath(liveSetPath),
          "Restored from disk",
          "utf8",
        );
        await appState.postConfig({ projectContext: "" });

        // The V8 side calls this route on its first tool call after the upgrade.
        // dispatchNodeRoute reads Max.outlet's first recorded call, so clear the
        // server-startup calls first.
        vi.mocked(Max.outlet).mockClear();
        const res = await dispatchNodeRoute("projectContext.sync", {
          filePath: liveSetPath,
          content: "",
          allowRestore: true,
        });

        expect(res.result).toStrictEqual({
          action: "restore",
          content: "Restored from disk",
        });

        // The route updated config directly so a restore during ppal-connect is
        // reflected in that response's injected project-context block.
        const configResponse = await fetch(configUrl);
        const config = await configResponse.json();

        expect(config.projectContext).toBe("Restored from disk");
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
        await appState.postConfig({ projectContext: "" });
      }
    });

    it("should update sampleFolder", async () => {
      const testPath = "/path/to/samples";

      const response = await appState.postConfig({ sampleFolder: testPath });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.sampleFolder).toBe(testPath);

      // Clear
      await appState.postConfig({ sampleFolder: "" });
    });

    it("should clear projectContext and sampleFolder sent as null", async () => {
      // Max sends a bare `null` for an emptied field; it must land as "" rather
      // than as a null the rest of the config code has to guard against.
      await appState.postConfig({
        projectContext: "notes",
        sampleFolder: "/path/to/samples",
      });

      const response = await appState.postConfig({
        projectContext: null,
        sampleFolder: null,
      });
      const config = await response.json();

      expect(config.projectContext).toBe("");
      expect(config.sampleFolder).toBe("");
    });

    it("should update tools whitelist", async () => {
      const subset = ["ppal-connect", "ppal-read-live-set", "ppal-playback"];

      const response = await appState.postConfig({ tools: subset });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.tools).toStrictEqual(subset);

      // Restore
      await appState.postConfig({ tools: [...TOOL_NAMES] });
    });

    it.each([
      {
        tools: ["ppal-connect", "ppal-nonexistent"],
        error: "ppal-nonexistent",
      },
      { tools: "not-an-array", error: "tools must be an array" },
    ])(
      "should return 400 for invalid tools: $error",
      async ({ tools, error }) => {
        const response = await appState.postConfig({ tools });

        expect(response.status).toBe(400);
        const body = await response.json();

        expect(body.error).toContain(error);
        expect(body.validToolNames).toStrictEqual([
          ...TOOL_NAMES,
          "ppal-live-api",
        ]);
      },
    );

    it("should return 400 when ppal-connect is omitted", async () => {
      const response = await appState.postConfig({
        tools: ["ppal-read-live-set", "ppal-playback"],
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error).toContain("ppal-connect");
      expect(body.validToolNames).toStrictEqual([
        ...TOOL_NAMES,
        "ppal-live-api",
      ]);
    });

    it("POST /config with no JSON body is a benign no-op, not a 500", async () => {
      // No Content-Type: application/json → express leaves req.body undefined;
      // the handler must treat the missing body as an empty update (200 echoing
      // the current config) rather than TypeError into a 500.
      const response = await fetch(configUrl, { method: "POST" });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config).toStrictEqual({
        jsonOutput: false,
        liveApiEnabled: true,
        liveApiForcedOn: false,
        notation: "barbeat",
        projectContext: "",
        sampleFolder: "",
        smallModelMode: false,
        tools: expect.any(Array),
      });
    });

    it("should reject POST /config from a cross-origin browser request", async () => {
      const response = await fetch(configUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.com",
        },
        body: JSON.stringify({ projectContext: "blocked" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();

      expect(body.error).toContain("cross-origin");
    });

    it("should accept POST /config from a localhost Origin", async () => {
      const response = await fetch(configUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:9999",
        },
        body: JSON.stringify({ projectContext: "" }),
      });

      expect(response.status).toBe(200);
    });

    it("allows cross-origin POST /mcp — intentional asymmetry with /config", async () => {
      // Unlike /config, /mcp is deliberately NOT localhost-gated: the chat UI's
      // getMcpUrl() points at the page's own origin, so over LAN/tunnel it POSTs
      // /mcp with a non-localhost Origin. A localhost gate here would 403 the
      // LAN/tunnel chat's own tool calls and break the documented web-tunnels
      // feature. Locked so the gate isn't added by mistake. (403 is returned
      // only by the /config origin gate, so "not 403" == "not origin-blocked".)
      const response = await fetch(appState.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Origin: "https://remote.example.com",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });

      expect(response.status).not.toBe(403);
    });
  });

  describe("Tools Whitelist Filtering", () => {
    let configUrl: string;

    beforeAll(() => {
      configUrl = appState.serverUrl.replace("/mcp", "/config");
    });

    it("should only include specified tools in listTools", async () => {
      const headers = { "Content-Type": "application/json" };
      const postConfig = (body: object) =>
        fetch(configUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

      // Set tools to a subset (without ppal-delete and ppal-select)
      const subset = [...TOOL_NAMES].filter(
        (name) => name !== "ppal-delete" && name !== "ppal-select",
      );

      await postConfig({ tools: subset });

      const client1 = new Client({ name: "test-client", version: "1.0.0" });
      const transport1 = new StreamableHTTPClientTransport(
        new URL(appState.serverUrl),
      );

      await client1.connect(transport1);
      const filtered = await client1.listTools();
      const filteredNames = filtered.tools.map((t) => t.name);

      expect(filteredNames).not.toContain("ppal-delete");
      expect(filteredNames).not.toContain("ppal-select");
      expect(filteredNames).toContain("ppal-connect");
      await transport1.close();

      // Restore all tools and verify
      await postConfig({ tools: [...TOOL_NAMES] });

      const client2 = new Client({ name: "test-client", version: "1.0.0" });
      const transport2 = new StreamableHTTPClientTransport(
        new URL(appState.serverUrl),
      );

      await client2.connect(transport2);
      const restored = await client2.listTools();
      const restoredNames = restored.tools.map((t) => t.name);

      expect(restoredNames).toContain("ppal-delete");
      expect(restoredNames).toContain("ppal-select");
      await transport2.close();
    });
  });
});
