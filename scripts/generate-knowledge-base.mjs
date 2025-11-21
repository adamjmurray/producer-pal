#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  processCopyDirectory,
  processCopyFile,
  processConcatenateDirectory,
  processConcatenateFile,
  writeGroupFiles,
} from "./helpers/generate-knowledge-base-processing.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "knowledge-base");

const IGNORE_PATTERNS = [
  /^\.DS_Store$/,
  /\.bak$/,
  /\.svg$/,
  /\.png$/,
  /\.gif$/,
  /\.jpg$/,
  /\.af$/,
  /\.afdesign$/,
  /^BingSiteAuth\.xml$/,
  /^CNAME$/,
];

const FLAT_SEP = "--";
const codeExts = [".js", ".mjs", ".ts", ".jsx", ".tsx"];

/**
 * Converts filesystem path separators to flat separator for file naming
 * @param {string} pathStr - The path string to flatten
 * @returns {string} - Flattened path string
 */
function flattenPath(pathStr) {
  return pathStr.replace(/[/\\]/g, FLAT_SEP);
}

/**
 * Adds items to a named group in the groups map
 * @param {Map} groups - Map of group names to arrays of items
 * @param {string} groupName - Name of the group to add to
 * @param {...any} item - Items to add to the group
 */
function addToGroup(groups, groupName, ...item) {
  if (!groups.has(groupName)) {
    groups.set(groupName, []);
  }
  groups.get(groupName).push(...item);
}

/**
 * Computes the group name for a file based on item configuration
 * @param {object} item - Configuration item from itemsToCopy
 * @param {string} filePath - Absolute path to the file
 * @param {string} root - Project root directory
 * @returns {string} - Computed group name
 */
function computeGroupName(item, filePath, root) {
  const itemGroup =
    typeof item.group === "function"
      ? item.group({
          config: item,
          file: filePath,
          relativePath: path.relative(root, filePath),
        })
      : item.group;

  return itemGroup || item.targetDirName || path.basename(item.src) || "misc";
}

/**
 * Cleans and creates the output directory
 */
async function cleanAndCreateOutputDir() {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`Removed existing outputDir: ${outputDir}`);
  } catch (_error) {
    // Directory doesn't exist, which is fine
  }
  await fs.mkdir(outputDir, { recursive: true });
}

const itemsToCopy = [
  // Directories (automatically get directory prefix)
  { src: ".github", isDir: true, targetDirName: "_github", group: "config" },
  { src: "config", isDir: true },
  { src: "dev-docs", isDir: true, exclude: ["img"] },
  {
    src: "docs",
    isDir: true,
    exclude: [".vitepress/cache", ".vitepress/dist"],
    group: "docs",
  },
  { src: "licenses", isDir: true },
  { src: "scripts", isDir: true },
  {
    src: "src",
    isDir: true,
    group: ({ relativePath }) => {
      if (relativePath.match(/\.test\.\w+$/)) {
        if (relativePath.startsWith("src/tools/")) {
          return "src--tools--tests";
        }
        if (relativePath.startsWith("src/notation/")) {
          return "src--notation--tests";
        }
        return "src--tests";
      }
      if (relativePath.startsWith("src/tools/")) {
        return "src--tools";
      }
      if (relativePath.startsWith("src/notation/")) {
        return "src--notation";
      }
      return "src";
    },
  },
  {
    src: "webui",
    isDir: true,
    exclude: ["node_modules", "dist"],
    group: ({ relativePath }) => {
      // Test case files (data fixtures for tests)
      if (relativePath.includes("/test-cases/")) {
        return "webui--test.ts";
      }
      // Test files
      if (relativePath.match(/\.test\.\w+$/)) {
        return "webui--test.ts";
      }
      // TSX files (React components)
      if (relativePath.endsWith(".tsx")) {
        return "webui--tsx";
      }
      // TS files (hooks, utilities, etc.)
      if (relativePath.endsWith(".ts")) {
        return "webui--ts";
      }
      // Everything else (CSS, HTML, SVG, etc.)
      return "webui--other";
    },
  },

  // Individual files
  {
    src: ".claude/skills/refactoring/SKILL.md",
    flatName: "claude-refactoring-SKILL.md",
    group: "config",
  },
  { src: ".gitignore", flatName: "gitignore", group: "config" },
  { src: "AGENTS.md", group: "config" },
  { src: "CLAUDE.md", group: "config" },
  { src: "GEMINI.md", group: "config" },
  { src: "DEVELOPERS.md", group: "doc" },
  { src: "LICENSE", group: "licenses" },
  { src: "package.json", group: "config" },
  { src: "README.md", group: "doc" },
  {
    src: "coverage/coverage-summary.txt",
    flatName: "test-coverage-summary.txt",
    group: "test-coverage",
  },
  { src: "claude-desktop-extension/.mcpbignore", group: "config" },
  { src: "claude-desktop-extension/manifest.template.json", group: "config" },
  { src: "claude-desktop-extension/package.json", group: "config" },
];

/**
 * Copies all configured directories and files with flat naming
 * @param {Set} excludeGroups - Set of group names to exclude
 */
async function copyDirectoriesAndFiles(excludeGroups) {
  console.log("Copying files...");

  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        // Copy all files from directory with automatic prefix
        await processCopyDirectory(
          item,
          sourcePath,
          outputDir,
          projectRoot,
          excludeGroups,
          FLAT_SEP,
          codeExts,
          IGNORE_PATTERNS,
          computeGroupName,
          flattenPath,
        );
      } else if (stat.isFile()) {
        await processCopyFile(
          item,
          sourcePath,
          outputDir,
          projectRoot,
          excludeGroups,
          codeExts,
          computeGroupName,
          flattenPath,
        );
      }
    } catch (_error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }
}

/**
 * Concatenates all configured directories and files by group
 * @param {Set} excludeGroups - Set of group names to exclude
 */
async function copyDirectoriesAndFilesConcatenated(excludeGroups) {
  console.log("Concatenating files into groups...");

  const fileGroups = new Map(); // Map of output filename -> array of source files

  // Process each item to group files appropriately
  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        await processConcatenateDirectory(
          item,
          sourcePath,
          projectRoot,
          fileGroups,
          IGNORE_PATTERNS,
          addToGroup,
        );
      } else if (stat.isFile()) {
        await processConcatenateFile(
          item,
          sourcePath,
          projectRoot,
          fileGroups,
          addToGroup,
        );
      }
    } catch (_error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }

  await writeGroupFiles(
    fileGroups,
    outputDir,
    projectRoot,
    excludeGroups,
    codeExts,
  );
}

/**
 *
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const isConcatMode = args.includes("--concat");

    // Parse --exclude-groups argument
    const excludeGroupsArg = args.find((arg) =>
      arg.startsWith("--exclude-groups="),
    );
    const excludeGroups = excludeGroupsArg
      ? new Set(
          excludeGroupsArg
            .split("=")[1]
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        )
      : new Set();

    if (isConcatMode) {
      console.log("Generating knowledge base files in CONCAT mode...");
    } else {
      console.log("Generating knowledge base files...");
    }

    if (excludeGroups.size > 0) {
      console.log(`Excluding groups: ${Array.from(excludeGroups).join(", ")}`);
    }

    await cleanAndCreateOutputDir();

    if (isConcatMode) {
      await copyDirectoriesAndFilesConcatenated(excludeGroups);
    } else {
      await copyDirectoriesAndFiles(excludeGroups);
    }

    console.log(
      `\nComplete! Knowledge base files ${isConcatMode ? "concatenated" : "copied"} to: ${path.relative(projectRoot, outputDir)}`,
    );

    const files = await fs.readdir(outputDir);
    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating knowledge base files:", error);
    process.exit(1);
  }
}

main();
