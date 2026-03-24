// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { describe, expect, it } from "vitest";
import { setupExpressAppServer } from "./express-app-test-helpers.ts";

// Type for mock Max module with test-specific properties
type MockMax = typeof Max & {
  handlers: Map<string, (input: unknown) => void>;
};
const mockMax = Max as MockMax;

describe("Handler Registration", () => {
  const appState = setupExpressAppServer();

  /**
   * Read a config field from the running server.
   * @param field - Config field name to read
   * @returns The field value
   */
  async function getConfigField(field: string) {
    const response = await fetch(`${appState.baseUrl}/config`);
    const config = await response.json();

    return config[field];
  }

  it("should set chatUIEnabled with various inputs", () => {
    const chatUIHandler = mockMax.handlers.get("chatUIEnabled") as (
      input: unknown,
    ) => void;

    expect(chatUIHandler).toBeDefined();
    chatUIHandler(1);
    chatUIHandler("true");
    chatUIHandler(0);
    chatUIHandler(1); // Re-enable
  });

  it("should set smallModelMode with various inputs", () => {
    const smallModelHandler = mockMax.handlers.get("smallModelMode") as (
      input: unknown,
    ) => void;

    expect(smallModelHandler).toBeDefined();

    // Test all branches: true case (1), true case ("true"), false cases (0, false)
    smallModelHandler(1);
    smallModelHandler("true");
    smallModelHandler(0);
    smallModelHandler(false);
  });

  it("should set memoryEnabled with various inputs", () => {
    const handler = mockMax.handlers.get("memoryEnabled") as (
      input: unknown,
    ) => void;

    expect(handler).toBeDefined();
    handler(1);
    handler(0);
  });

  it("should set memoryContent and coerce bang/null/undefined to empty", async () => {
    const handler = mockMax.handlers.get("memoryContent") as (
      input: unknown,
    ) => void;

    expect(handler).toBeDefined();

    handler("test notes");
    expect(await getConfigField("memoryContent")).toBe("test notes");

    handler("");
    expect(await getConfigField("memoryContent")).toBe("");

    // Max textedit idiosyncrasy: bang means empty string
    handler("bang");
    expect(await getConfigField("memoryContent")).toBe("");

    handler(null);
    expect(await getConfigField("memoryContent")).toBe("");

    handler(undefined);
    expect(await getConfigField("memoryContent")).toBe("");
  });

  it("should set memoryWritable with various inputs", () => {
    const handler = mockMax.handlers.get("memoryWritable") as (
      input: unknown,
    ) => void;

    expect(handler).toBeDefined();
    handler(1);
    handler(0);
  });

  it("should set compactOutput with various inputs", () => {
    const handler = mockMax.handlers.get("compactOutput") as (
      input: unknown,
    ) => void;

    expect(handler).toBeDefined();
    handler(1);
    handler(0);
  });

  it("should set sampleFolder and coerce bang/null/undefined to empty", async () => {
    const handler = mockMax.handlers.get("sampleFolder") as (
      input: unknown,
    ) => void;

    expect(handler).toBeDefined();

    handler("/path/to/samples");
    expect(await getConfigField("sampleFolder")).toBe("/path/to/samples");

    handler("");
    expect(await getConfigField("sampleFolder")).toBe("");

    // Max textedit idiosyncrasy: bang means empty string
    handler("bang");
    expect(await getConfigField("sampleFolder")).toBe("");

    handler(null);
    expect(await getConfigField("sampleFolder")).toBe("");

    handler(undefined);
    expect(await getConfigField("sampleFolder")).toBe("");
  });
});
