#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Zips the example agent skills for download from the docs site.
 *
 * Writes producer-pal-skill.zip (the main skill) and
 * producer-pal-all-skills.zip (every skill folder) to docs/public/downloads/.
 * Skill folders sit at the zip root, so unzipping into ~/.claude/skills/ (or
 * the equivalent) lands them where an agent looks. Naming the folders
 * explicitly also keeps examples/skills/README.md — which is repo-facing — out
 * of the zips.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipFolders } from "./helpers/zip-archive.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");
const SKILLS_DIR = path.join(PROJECT_ROOT, "examples/skills");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "docs/public/downloads");
const MAIN_SKILL = "producer-pal";

/**
 * List the skill folders.
 *
 * @returns Folder names under examples/skills/
 */
async function findSkills(): Promise<string[]> {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  if (!skills.includes(MAIN_SKILL)) {
    throw new Error(`No ${MAIN_SKILL} folder in ${SKILLS_DIR}`);
  }

  return skills;
}

/**
 * Generate the downloadable skill zips.
 */
async function main(): Promise<void> {
  const skills = await findSkills();

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  zipFolders(
    path.join(OUTPUT_DIR, "producer-pal-skill.zip"),
    SKILLS_DIR,
    [MAIN_SKILL],
    [".DS_Store"],
  );
  zipFolders(
    path.join(OUTPUT_DIR, "producer-pal-all-skills.zip"),
    SKILLS_DIR,
    skills,
    [".DS_Store"],
  );

  console.log(
    `Generated skill zips in docs/public/downloads/ (${skills.length} skills)`,
  );
}

await main();
