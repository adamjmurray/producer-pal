import * as console from "#src/shared/v8-max-console.js";

const MAX_SAMPLE_FILES = 1000;

const AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".aiff",
  ".aif",
  ".aifc",
  ".flac",
  ".ogg",
  ".mp3",
  ".m4a",
]);

/**
 * List audio files from configured sample folder
 * @param {object} args - The parameters
 * @param {string} [args.search] - Optional case-insensitive substring filter on relative paths
 * @param {{ sampleFolder?: string | null }} context - Context containing sampleFolder path
 * @returns {{ sampleFolder: string, samples: string[] }} Sample folder and relative paths
 */
export function readSamples({ search } = {}, context = {}) {
  if (!context.sampleFolder) {
    throw new Error(
      "A sample folder must first be selected in the Setup tab of the Producer Pal Max for Live device",
    );
  }

  let sampleFolder = context.sampleFolder;

  if (!sampleFolder.endsWith("/")) {
    sampleFolder = `${sampleFolder}/`;
  }

  /** @type {string[]} */
  const samples = [];
  const limitReached = { value: false };
  const searchLower = search ? search.toLowerCase() : null;

  scanFolder(sampleFolder, sampleFolder, samples, limitReached, searchLower);

  if (limitReached.value) {
    console.error(
      `Stopped scanning for samples at ${MAX_SAMPLE_FILES} files. Consider using a smaller sample folder.`,
    );
  }

  return { sampleFolder, samples };
}

/**
 * Recursively scan a folder for audio files
 * @param {string} dirPath - Directory path (must end with /)
 * @param {string} baseFolder - Base folder path for relative path calculation
 * @param {string[]} results - Array to append results to
 * @param {{ value: boolean }} limitReached - Flag to track if file limit was reached
 * @param {string|null} searchLower - Lowercase search filter or null
 */
function scanFolder(dirPath, baseFolder, results, limitReached, searchLower) {
  const f = new Folder(dirPath);

  while (!f.end) {
    if (results.length >= MAX_SAMPLE_FILES) {
      limitReached.value = true;
      f.close();

      return;
    }

    const filepath = `${f.pathname}${f.filename}`;

    if (f.filetype === "fold") {
      scanFolder(
        `${filepath}/`,
        baseFolder,
        results,
        limitReached,
        searchLower,
      );
    } else if (AUDIO_EXTENSIONS.has(f.extension?.toLowerCase())) {
      const relativePath = filepath.substring(baseFolder.length);

      if (!searchLower || relativePath.toLowerCase().includes(searchLower)) {
        results.push(relativePath);
      }
    }

    f.next();
  }

  f.close();
}
