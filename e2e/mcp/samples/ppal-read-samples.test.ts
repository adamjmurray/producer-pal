// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * E2E tests for ppal-read-samples tool
 * Uses once mode to reuse MCP connection across tests (faster).
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/samples/ppal-read-samples.test.ts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

// Sample folder - resolve relative to this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = resolve(__dirname, "../../../evals/live-sets/samples");

/** Helper to call ppal-read-samples */
async function callReadSamples(search?: string): Promise<string> {
  const args: { search?: string } = {};

  if (search !== undefined) {
    args.search = search;
  }

  const result = await ctx.client!.callTool({
    name: "ppal-read-samples",
    arguments: args,
  });

  return extractToolResultText(result);
}

describe("ppal-read-samples", () => {
  it("returns error when no sample folder is configured", async () => {
    // resetConfig() sets sampleFolder to "" which should trigger an error
    const result = await callReadSamples();

    expect(result).toContain("sample folder must first be selected");
  });

  it("lists all samples recursively from configured folder", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const text = await callReadSamples();
    const result = JSON.parse(text) as ReadSamplesResult;

    expect(result.sampleFolder).toBe(`${SAMPLE_FOLDER}/`);
    expect(result.samples).toHaveLength(2);
    expect(result.samples).toContain("sample.aiff");
    expect(result.samples).toContain("drums/kick.aiff");
  });

  it("filters samples with search parameter", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    // Search that matches one file in subfolder
    const kickText = await callReadSamples("kick");
    const kickResult = JSON.parse(kickText) as ReadSamplesResult;

    expect(kickResult.samples).toHaveLength(1);
    expect(kickResult.samples).toContain("drums/kick.aiff");

    // Search that matches different file in root
    const sampleText = await callReadSamples("sample");
    const sampleResult = JSON.parse(sampleText) as ReadSamplesResult;

    expect(sampleResult.samples).toHaveLength(1);
    expect(sampleResult.samples).toContain("sample.aiff");

    // Search that doesn't match any file
    const noMatchText = await callReadSamples("nonexistent");
    const noMatchResult = JSON.parse(noMatchText) as ReadSamplesResult;

    expect(noMatchResult.samples).toHaveLength(0);
  });
});

/**
 * Type for ppal-read-samples result (matches read-samples.ts)
 */
interface ReadSamplesResult {
  sampleFolder: string;
  samples: string[];
}
