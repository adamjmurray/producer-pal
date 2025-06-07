#!/usr/bin/env node
// tools/generate-claude-project.mjs

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "claude-project");

async function cleanAndCreateOutputDir() {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, which is fine
  }
  await fs.mkdir(outputDir, { recursive: true });
}

async function copyFile(sourcePath, targetPath) {
  const content = await fs.readFile(sourcePath, "utf8");
  await fs.writeFile(targetPath, content);
}

async function findSourceFiles(dir, baseDir, skipTests = true) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      files.push(...(await findSourceFiles(fullPath, baseDir, skipTests)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const isTestFile =
        entry.name.includes(".test.") || entry.name.includes(".spec.");

      // Include JavaScript and Peggy grammar files, but skip tests if requested
      if ((ext === ".js" || ext === ".peggy") && (!skipTests || !isTestFile)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function copyDirectoriesAndFiles() {
  const itemsToCopy = [
    // Directories (automatically get directory prefix)
    { src: "src", isDir: true, skipTests: false },
    { src: "doc", isDir: true },
    { src: "tools", isDir: true },

    // Individual files (no prefix)
    { src: "README.md" },
    { src: "package.json" },
    { src: "rollup.config.mjs" },
    { src: "vitest.config.ts" },
    { src: "test-setup.js" },
    {
      src: "coverage/coverage-summary.txt",
      flatName: "test-coverage-summary.txt",
    },
  ];

  console.log("Copying files...");

  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        // Copy all files from directory with automatic prefix
        const files = item.skipTests
          ? await findSourceFiles(sourcePath, sourcePath, true)
          : await findAllFiles(sourcePath);

        const dirName = path.basename(item.src);

        for (const filePath of files) {
          const relativePath = path.relative(sourcePath, filePath);
          const flatName =
            dirName + "--" + relativePath.replace(/[/\\]/g, "--");
          const targetPath = path.join(outputDir, flatName);
          await copyFile(filePath, targetPath);
          console.log(
            `  ${path.relative(projectRoot, filePath)} → ${flatName}`,
          );
        }
      } else if (stat.isFile()) {
        // Copy single file
        const targetName = item.flatName || path.basename(item.src);
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
