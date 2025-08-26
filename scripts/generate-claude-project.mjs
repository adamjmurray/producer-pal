#!/usr/bin/env node
// scripts/generate-claude-project.mjs

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "claude-project");

const FLAT_SEP = "--";

function flattenPath(pathStr) {
  return pathStr.replace(/[/\\]/g, FLAT_SEP);
}

async function cleanAndCreateOutputDir() {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`Removed existing outputDir: ${outputDir}`);
  } catch (error) {
    // Directory doesn't exist, which is fine
  }
  await fs.mkdir(outputDir, { recursive: true });
}

async function copyFile(sourcePath, targetPath) {
  await fs.copyFile(sourcePath, targetPath);
}

async function copyDirectoriesAndFiles() {
  const itemsToCopy = [
    // Directories (automatically get directory prefix)
    // Use targetDirName to override the directory name in output
    { src: ".github", isDir: true, targetDirName: "_github" },
    { src: "config", isDir: true },
    { src: "doc", isDir: true },
    { src: "scripts", isDir: true },
    { src: "src", isDir: true },

    // Individual files (no prefix)
    { src: "CLAUDE.md" }, // so the Claude Project can give advice on using Claude Code
    { src: "DEVELOPERS.md" },
    { src: "FEATURES.md" },
    { src: "LICENSE.md" },
    { src: "package.json" },
    { src: "README.md" },
    {
      src: "coverage/coverage-summary.txt",
      flatName: "test-coverage-summary.txt",
    },
    // { src: "desktop-extension/icon.png" },
    { src: "desktop-extension/package.json" },
    // { src: "desktop-extension/screenshot.png" },
  ];

  console.log("Copying files...");

  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        // Copy all files from directory with automatic prefix
        const files = await findAllFiles(sourcePath);

        const dirName = item.targetDirName || path.basename(item.src);

        for (const filePath of files) {
          const relativePath = path.relative(sourcePath, filePath);
          const flatName = dirName + FLAT_SEP + flattenPath(relativePath);
          const targetPath = path.join(outputDir, flatName);
          await copyFile(filePath, targetPath);
          console.log(
            `  ${path.relative(projectRoot, filePath)} → ${path.relative(projectRoot, targetPath)}`,
          );
        }
      } else if (stat.isFile()) {
        // Copy single file
        const targetName = item.flatName || flattenPath(item.src);
        const targetPath = path.join(outputDir, targetName);
        await copyFile(sourcePath, targetPath);
        console.log(`  ${item.src} → ${targetName}`);
      }
    } catch (error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }
}

async function findAllFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip .DS_Store files
    if (entry.name === ".DS_Store") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await findAllFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  try {
    console.log("Generating Claude Project files...");

    await cleanAndCreateOutputDir();
    await copyDirectoriesAndFiles();

    console.log(
      `\nComplete! Files copied to: ${path.relative(projectRoot, outputDir)}`,
    );

    const files = await fs.readdir(outputDir);
    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating Claude Project files:", error);
    process.exit(1);
  }
}

main();
