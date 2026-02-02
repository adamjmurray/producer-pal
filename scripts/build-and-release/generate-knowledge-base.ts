#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledgeBaseConfig } from "./helpers/kb-config.ts";
import { processItems } from "./helpers/kb-processors.ts";

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
    // Create configuration
    const config = createKnowledgeBaseConfig(projectRoot);

    console.log("Generating knowledge base files...");

    // Clean and prepare output directory
    await cleanAndCreateOutputDir(config.outputDir);

    // Process files
    await processItems(config);

    // Display summary
    console.log(
      `\nComplete! Knowledge base files copied to: ${path.relative(projectRoot, config.outputDir)}`,
    );

    const files = await fs.readdir(config.outputDir);

    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating knowledge base files:", error);
    process.exit(1);
  }
}

await main();
