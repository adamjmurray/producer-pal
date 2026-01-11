import { readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Recursively get all files in a directory
 * @param {string} dir - Directory path to scan
 * @param {Array<string>} files - Accumulator array for file paths
 * @returns {Array<string>} - Array of file paths
 */
function getAllFiles(dir, files = []) {
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

/**
 * Check if a filename follows kebab-case convention
 * @param {string} name - Filename (without extension) to check
 * @returns {boolean} - True if filename follows kebab-case
 */
function isKebabCase(name) {
  // Remove known suffixes first
  const withoutSuffix = name
    .replace(/\.def$/, "")
    .replace(/\.test$/, "")
    .replace(/\.d$/, "");

  // Check if it follows kebab-case (lowercase, hyphens, no dots)
  return /^[a-z][\da-z]*(-[\da-z]+)*$/.test(withoutSuffix);
}

/**
 * Check if a filename has only allowed dots (for suffixes and extension)
 * @param {string} filename - Full filename to validate
 * @returns {boolean} - True if filename has valid dot usage
 */
function hasValidDots(filename) {
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
          file: file.replace(process.cwd() + "/", ""),
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
          file: file.replace(process.cwd() + "/", ""),
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
