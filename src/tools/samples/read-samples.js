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
 * @param {object} _args - Unused parameters
 * @param {object} context - Context containing sampleFolder path
 * @returns {{ sampleFolder: string, samples: string[] }} Sample folder and relative paths
 */
export function readSamples(_args, context) {
  if (!context.sampleFolder) {
    throw new Error(
      "A sample folder must first be selected in the Setup tab of the Producer Pal Max for Live device",
    );
  }

  let sampleFolder = context.sampleFolder;
  if (!sampleFolder.endsWith("/")) {
    sampleFolder = `${sampleFolder}/`;
  }

  const samples = [];
  const limitReached = { value: false };
  scanFolder(sampleFolder, sampleFolder, samples, limitReached);

  if (limitReached.value) {
    console.error(
      `Stopped scanning for samples at ${MAX_SAMPLE_FILES} files. Consider using a smaller sample folder.`,
    );
  }

  return { sampleFolder, samples };
}

// dirPath must end with /
function scanFolder(dirPath, baseFolder, results, limitReached) {
  const f = new Folder(dirPath);
  while (!f.end) {
    if (results.length >= MAX_SAMPLE_FILES) {
      limitReached.value = true;
      f.close();
      return;
    }
    const filepath = `${f.pathname}${f.filename}`;
    if (f.filetype === "fold") {
      scanFolder(`${filepath}/`, baseFolder, results, limitReached);
    } else if (AUDIO_EXTENSIONS.has(f.extension?.toLowerCase())) {
      results.push(filepath.substring(baseFolder.length));
    }
    f.next();
  }
  f.close();
}
