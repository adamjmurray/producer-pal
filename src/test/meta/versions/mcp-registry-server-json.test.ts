// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

// npm/server.json is the MCP Registry entry for the npm package. The registry
// ties it to the published package by name and by the `mcpName` field in the
// package's own package.json, and rejects a publish where they disagree. The
// version is checked in version-agreement.test.ts.
interface ServerJson {
  name: string;
  description: string;
  version: string;
  packages: {
    registryType: string;
    identifier: string;
    version: string;
    runtimeHint: string;
    transport: { type: string };
  }[];
}

interface NpmPackageJson {
  name: string;
  version: string;
  mcpName: string;
}

describe("npm/server.json", () => {
  const server = readJson("npm/server.json") as ServerJson;
  const npmPackage = readJson("npm/package.json") as NpmPackageJson;
  const [pkg] = server.packages;

  it("names the server after the mcpName in npm/package.json", () => {
    expect(server.name).toBe(npmPackage.mcpName);
  });

  it("uses a GitHub-auth namespace", () => {
    expect(server.name).toMatch(/^io\.github\.adamjmurray\/[a-z0-9-]+$/);
  });

  it("lists exactly the npm package, as a stdio server", () => {
    expect(server.packages).toHaveLength(1);
    expect(pkg).toStrictEqual({
      registryType: "npm",
      identifier: npmPackage.name,
      version: server.version,
      runtimeHint: "npx",
      transport: { type: "stdio" },
    });
  });

  it("keeps the description within the registry's 100 character limit", () => {
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});

/**
 * Reads and parses a JSON file at a repo-relative path.
 * @param file - Path relative to the repo root
 * @returns The parsed JSON
 */
function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(projectRoot, file), "utf8"));
}
