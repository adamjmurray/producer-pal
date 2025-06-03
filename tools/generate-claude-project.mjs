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

function flattenPath(filePath, baseDir) {
  const relativePath = path.relative(baseDir, filePath);
  return relativePath.replace(/[/\\]/g, "--");
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
      const isTestFile = entry.name.includes(".test.") || entry.name.includes(".spec.");

      // Include JavaScript and Peggy grammar files, but skip tests if requested
      if ((ext === ".js" || ext === ".peggy") && (!skipTests || !isTestFile)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function copySourceFiles() {
  const srcDir = path.join(projectRoot, "src");
  const sourceFiles = await findSourceFiles(srcDir, srcDir, true);

  console.log(`Copying ${sourceFiles.length} source files...`);

  for (const filePath of sourceFiles) {
    const flatName = flattenPath(filePath, srcDir);
    const targetPath = path.join(outputDir, flatName);
    await copyFile(filePath, targetPath);
    console.log(`  ${path.relative(projectRoot, filePath)} → ${flatName}`);
  }
}

async function copyDocsAndConfigs() {
  const filesToCopy = [
    // Documentation
    { src: "doc", isDir: true },
    { src: "README.md" },

    // Configuration files
    { src: "package.json" },
    { src: "rollup.config.mjs" },
    { src: "vitest.config.ts" },
    { src: "test-setup.js" },

    // Other important files
    { src: "e2e/cli.mjs", flatName: "e2e--cli.mjs" },
    { src: "coverage/coverage-summary.txt", flatName: "test-coverage-summary.txt" },
  ];

  console.log("Copying documentation and configuration files...");

  for (const file of filesToCopy) {
    const sourcePath = path.join(projectRoot, file.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (file.isDir && stat.isDirectory()) {
        // Copy all files from directory with flattened names
        const files = await findAllFiles(sourcePath);
        for (const filePath of files) {
          const flatName = flattenPath(filePath, projectRoot);
          const targetPath = path.join(outputDir, flatName);
          await copyFile(filePath, targetPath);
          console.log(`  ${path.relative(projectRoot, filePath)} → ${flatName}`);
        }
      } else if (stat.isFile()) {
        // Copy single file
        const targetName = file.flatName || path.basename(file.src);
        const targetPath = path.join(outputDir, targetName);
        await copyFile(sourcePath, targetPath);
        console.log(`  ${file.src} → ${targetName}`);
      }
    } catch (error) {
      console.log(`  Skipping ${file.src} (not found)`);
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
    await copySourceFiles();
    await copyDocsAndConfigs();

    console.log(`\nComplete! Files copied to: ${path.relative(projectRoot, outputDir)}`);

    const files = await fs.readdir(outputDir);
    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating Claude Project files:", error);
    process.exit(1);
  }
}

main();
