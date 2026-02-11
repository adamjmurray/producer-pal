// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..", "..");

const SOURCE_DIRS = ["src", "webui/src", "evals", "e2e", "scripts", "config"];

const EXCLUDED_FILES = [
  "src/notation/barbeat/parser/generated-barbeat-parser.js",
  "src/notation/modulation/parser/generated-modulation-parser.js",
];

const EXPECTED_HEADER_START = "// Producer Pal";
const EXPECTED_SPDX = "// SPDX-License-Identifier: GPL-3.0-or-later";

function getAllSourceFiles(dir: string, files: string[] = []): string[] {
  let entries: string[];

  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      if (entry !== "node_modules" && entry !== "coverage") {
        getAllSourceFiles(fullPath, files);
      }
    } else {
      const ext = extname(entry);

      if ([".ts", ".tsx", ".mjs"].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function hasValidLicenseHeader(filePath: string): {
  valid: boolean;
  reason?: string;
} {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Handle shebang - header should come after it
  let startLine = 0;

  if (lines[0]?.startsWith("#!")) {
    startLine = 1;
  }

  // Check for "// Producer Pal" at the expected position
  if (!lines[startLine]?.startsWith(EXPECTED_HEADER_START)) {
    return {
      valid: false,
      reason: `Missing "${EXPECTED_HEADER_START}" at line ${startLine + 1}`,
    };
  }

  // Check for SPDX identifier within first few lines
  const headerLines = lines.slice(startLine, startLine + 5);
  const hasSpdx = headerLines.some((line) => line.includes(EXPECTED_SPDX));

  if (!hasSpdx) {
    return {
      valid: false,
      reason: `Missing SPDX license identifier`,
    };
  }

  return { valid: true };
}

describe("License headers", () => {
  const allFiles: string[] = [];

  for (const dir of SOURCE_DIRS) {
    getAllSourceFiles(dir, allFiles);
  }

  // Filter out excluded files
  const sourceFiles = allFiles.filter(
    (f) => !EXCLUDED_FILES.some((excluded) => f.endsWith(excluded)),
  );

  it("should have source files to check", () => {
    expect(sourceFiles.length).toBeGreaterThan(500);
  });

  it("all source files should have SPDX license headers", () => {
    const violations: Array<{ file: string; reason: string }> = [];

    for (const file of sourceFiles) {
      const result = hasValidLicenseHeader(file);

      if (!result.valid) {
        violations.push({
          file: relative(rootDir, file),
          reason: result.reason ?? "Unknown",
        });
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}: ${v.reason}`)
        .join("\n");

      throw new Error(
        `License header violations found (${violations.length} files):\n${message}\n\n` +
          `Expected format:\n` +
          `  // Producer Pal\n` +
          `  // Copyright (C) <year> <author>\n` +
          `  // AI assistance: <AI tool> (<company>)  (if AI-assisted)\n` +
          `  // SPDX-License-Identifier: GPL-3.0-or-later`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

describe("License embedding", () => {
  it("should have the current LICENSE embedded in the Max for Live device", () => {
    const licensePath = "LICENSE";
    const devicePath = "max-for-live-device/Producer_Pal.amxd";

    // Check files exist
    expect(existsSync(licensePath), `${licensePath} not found`).toBe(true);
    expect(existsSync(devicePath), `${devicePath} not found`).toBe(true);

    // Read the license file
    const licenseText = readFileSync(licensePath, "utf8").trim();

    // Read the device file
    const deviceContent = readFileSync(devicePath, "utf8");

    // Convert license text to JSON-escaped format (like what we see in the .amxd)
    const escapedLicense = licenseText
      .replaceAll("\\", "\\\\") // Escape backslashes
      .replaceAll('"', '\\"') // Escape quotes
      .replaceAll("\n", "\\n"); // Convert newlines to \n

    // Check if the escaped license text is in the device
    expect(
      deviceContent,
      `License text not found in ${devicePath}.

Expected to find the contents of ${licensePath} embedded in the Max device.
This suggests the license in the Max patch comment needs to be updated.

To fix (a human must do this):
1. Open the Max for Live device in Max
2. Update the license text in a comment object
3. Freeze the device
4. Run this test again

First few chars of expected license:
${escapedLicense.substring(0, 100)}...

First few chars found in device:
${deviceContent.substring(deviceContent.indexOf('"text"'), 200)}...`,
    ).toContain(escapedLicense);
  });
});
