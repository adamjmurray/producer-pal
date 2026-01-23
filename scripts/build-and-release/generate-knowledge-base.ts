#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledgeBaseConfig } from "./helpers/kb-config.ts";
import { processFlatMode, processConcatMode } from "./helpers/kb-processors.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "../..");

/**
 * Cleans and creates the output directory
 * @param outputDir - Output directory path
 */
async function cleanAndCreateOutputDir(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`Removed existing outputDir: ${outputDir}`);
  } catch {
    // Directory doesn't exist, which is fine
  }

  await fs.mkdir(outputDir, { recursive: true });
}

/**
 * Main entry point for knowledge base generation
 */
async function main(): Promise<void> {
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
          (excludeGroupsArg.split("=")[1] ?? "")
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        )
      : new Set<string>();

    // Create configuration
    const config = createKnowledgeBaseConfig(projectRoot);

    // Display mode and excluded groups
    if (isConcatMode) {
      console.log("Generating knowledge base files in CONCAT mode...");
    } else {
      console.log("Generating knowledge base files...");
    }

    if (excludeGroups.size > 0) {
      console.log(`Excluding groups: ${Array.from(excludeGroups).join(", ")}`);
    }

    // Clean and prepare output directory
    await cleanAndCreateOutputDir(config.outputDir);

    // Process files based on mode
    await (isConcatMode
      ? processConcatMode(config, excludeGroups)
      : processFlatMode(config, excludeGroups));

    // Display summary
    console.log(
      `\nComplete! Knowledge base files ${isConcatMode ? "concatenated" : "copied"} to: ${path.relative(projectRoot, config.outputDir)}`,
    );

    const files = await fs.readdir(config.outputDir);

    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating knowledge base files:", error);
    process.exit(1);
  }
}

await main();
