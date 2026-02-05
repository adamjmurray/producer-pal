// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readdirSync, statSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function getAllFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      if (entry !== "node_modules") {
        getAllFiles(fullPath, files);
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function isKebabCase(name: string): boolean {
  // Remove known suffixes first
  const withoutSuffix = name
    .replace(/\.def$/, "")
    .replace(/\.test$/, "")
    .replace(/\.d$/, "");

  // Check if it follows kebab-case (lowercase, hyphens, no dots)
  return /^[a-z][\da-z]*(-[\da-z]+)*$/.test(withoutSuffix);
}

function hasValidDots(filename: string): boolean {
  const name = basename(filename);
  const ext = extname(name);
  const nameWithoutExt = name.slice(0, -ext.length);

  // Allowed patterns: name.js, name.test.js, name.def.js, name.d.ts
  const validPatterns = [
    /^[^.]+$/, // no dots (name.js)
    /^[^.]+\.test$/, // .test suffix (name.test.js)
    /^[^.]+\.def$/, // .def suffix (name.def.js)
    /^[^.]+\.d$/, // .d suffix (name.d.ts)
  ];

  return validPatterns.some((pattern) => pattern.test(nameWithoutExt));
}

describe("File naming conventions", () => {
  const srcFiles = getAllFiles("src").filter(
    (f) => f.endsWith(".js") || f.endsWith(".ts"),
  );

  it("should have at least some files to check", () => {
    expect(srcFiles.length).toBeGreaterThan(0);
  });

  it("all src files should use kebab-case", () => {
    const violations = [];

    for (const file of srcFiles) {
      const name = basename(file);
      const ext = extname(name);
      const nameWithoutExt = name.slice(0, -ext.length);

      if (!isKebabCase(nameWithoutExt)) {
        violations.push({
          file: file.replace(rootDir + "/", ""),
          reason: `"${nameWithoutExt}" is not kebab-case`,
        });
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}: ${v.reason}`)
        .join("\n");

      throw new Error(`File naming violations found:\n${message}`);
    }

    expect(violations).toHaveLength(0);
  });

  it("all src files should only use dots for known suffixes and extensions", () => {
    const violations = [];

    for (const file of srcFiles) {
      const name = basename(file);

      if (!hasValidDots(name)) {
        violations.push({
          file: file.replace(rootDir + "/", ""),
          reason: `Uses dots incorrectly (use hyphens instead)`,
        });
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}: ${v.reason}`)
        .join("\n");

      throw new Error(
        `File naming violations found:\n${message}\n\n` +
          `Allowed patterns:\n` +
          `  - name.js (no dots in base name)\n` +
          `  - name.test.js (.test suffix)\n` +
          `  - name.def.js (.def suffix)\n` +
          `  - name.d.ts (.d suffix)\n\n` +
          `Invalid patterns:\n` +
          `  - name.helper.js (use name-helper.js)\n` +
          `  - name.util.js (use name-util.js or better: name-operations.js)\n` +
          `  - name.config.js (use name-config.js)`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});
