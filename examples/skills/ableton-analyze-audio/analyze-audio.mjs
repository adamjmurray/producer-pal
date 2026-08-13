#!/usr/bin/env node

// analyze-audio.mjs — send an audio file to Google's Gemini API and print the
// model's analysis. Zero dependencies (Node 18+ global fetch).
//
// Auth: set GEMINI_API_KEY in the environment (or pass --api-key). This is the
// whole reason audio analysis lives in a coding-agent skill instead of the
// Producer Pal device — the Max-for-Live runtime has no clean secrets story.
//
// Small files are sent inline; larger ones go through the Files API (upload,
// wait for ACTIVE, then reference). An upload is NOT deleted for you — it's
// printed instead, so more questions about the same audio cost one upload
// (--file-uri) and you delete it when you're done (--delete). Storage is free
// and Google drops it after 48h regardless. NOTE: model IDs and request limits
// move — override the model with --model / GEMINI_MODEL and check Google's docs.
//
// Usage:
//   node analyze-audio.mjs render.mp3
//   node analyze-audio.mjs render.mp3 --prompt "Describe the timbre and any mix issues."
//   node analyze-audio.mjs render.mp3 --upload          # force an upload, to reuse it
//   node analyze-audio.mjs --file-uri files/abc --prompt "Now describe the drums."
//   node analyze-audio.mjs --delete files/abc
//   GEMINI_MODEL=<other-model> node analyze-audio.mjs render.mp3
//
// Each run is one question — reusing an upload saves the transfer, not the
// context. The model never sees the previous answer.
//
// Expectations: Gemini gives strong QUALITATIVE description (timbre, character,
// obvious problems, transcription). It is not a precise MIR tool — don't trust
// it for exact tempo/key/onset numbers; measure those with DSP if you need them.

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API_ROOT = "https://generativelanguage.googleapis.com";
// Gemini caps a request's inline data at 20 MB and base64 inflates bytes by ~4/3,
// so keep the raw file under ~14 MB inline; larger goes through the Files API.
const INLINE_MAX_BYTES = 14 * 1024 * 1024;
// Gemini audio MIME types, keyed by file extension (all accepted natively).
const AUDIO_MIME = {
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};
const DEFAULT_MODEL = "gemini-3.6-flash";
// The silence sentence earns its place: a render from Ableton covers the whole
// arrangement, so a single track or clip arrives padded with silence. Asking
// where the music is beats guessing, and it makes a wrong-track render obvious.
// The "only what you hear" clause earns its place too: asked openly to describe
// the instrumentation, the model padded a drum stem with a bass part and vocal
// stabs that were not in it — then correctly said "no vocal stabs" when asked
// directly. Open description invites genre-typical filler.
const DEFAULT_PROMPT =
  "You are an audio engineer. Analyze this rendered audio: describe the " +
  "instrumentation and timbre, the overall character and mood, and flag any " +
  "obvious problems (clipping, noise, imbalance). Keep it concise. The file " +
  "may be mostly silence — say where the audible material starts and ends, " +
  "and analyze only that part. Describe only what you actually hear: do not " +
  "infer instruments that are typical of the genre, and say so when you are " +
  "unsure whether something is present.";

// Options that consume the following argument; everything else is positional.
const VALUE_OPTS = new Set([
  "--prompt",
  "-p",
  "--model",
  "--api-key",
  "--file-uri",
  "--delete",
]);
const USAGE =
  "Usage: node analyze-audio.mjs <audio-file> [--prompt <text>] [--upload]\n" +
  "       node analyze-audio.mjs --file-uri <files/id> [--prompt <text>]\n" +
  "       node analyze-audio.mjs --delete <files/id>";

/**
 * Split argv into positionals and a value map, honoring value-taking options.
 * @param {string[]} argv - Arguments after the node script name.
 * @returns {{positionals: string[], opts: Record<string, string>}} Parsed args.
 */
function parseArgs(argv) {
  const positionals = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_OPTS.has(arg)) {
      const value = argv[++i];
      // No value — last token, or another flag right after — is a malformed
      // invocation, not a request for the default. Falling back silently ran
      // `--api-key` against GEMINI_API_KEY with nothing to say it had.
      if (value == null || value.startsWith("--"))
        throw new Error(`Missing value for ${arg}`);
      opts[arg] = value;
    } else if (arg.startsWith("--"))
      opts[arg] = "true"; // bare boolean flag
    else positionals.push(arg);
  }
  return { positionals, opts };
}

async function main() {
  const { positionals, opts } = parseArgs(process.argv.slice(2));
  const apiKey =
    opts["--api-key"] ?? process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key (set GEMINI_API_KEY or GEMINI_KEY, or pass --api-key).",
    );
  }

  if (opts["--delete"] != null) {
    const name = fileRef(opts["--delete"]);
    await deleteFile(name, apiKey);
    process.stderr.write(`Deleted ${name}\n`);
    return;
  }

  const file = positionals[0];
  const reuse = opts["--file-uri"];
  if (!file && !reuse) throw new Error(USAGE);

  const model = opts["--model"] ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const prompt = opts["--prompt"] ?? opts["-p"] ?? DEFAULT_PROMPT;
  const audioPart = reuse
    ? await uploadedPart(fileRef(reuse), apiKey)
    : await localPart(file, apiKey, opts["--upload"] != null);

  process.stderr.write(`Asking ${model}…\n`);
  const text = await generate({ apiKey, model, prompt, audioPart });
  process.stdout.write(text + "\n");
}

/**
 * Build the audio part for a local file: inline when it's small, otherwise (or
 * with `upload`) via the Files API. An upload is left in place for reuse and
 * reported on stderr — deleting it is the caller's job, like the audio file.
 * @param {string} file - Path to the audio file.
 * @param {string} apiKey - Gemini API key.
 * @param {boolean} upload - Force the Files API even for a small file.
 * @returns {Promise<object>} A generateContent part.
 */
async function localPart(file, apiKey, upload) {
  // Guessing a MIME type for an unknown extension only moves the failure to the
  // API, where the message is worse.
  const ext = extname(file).toLowerCase();
  const mimeType = AUDIO_MIME[ext];
  if (!mimeType)
    throw new Error(
      `Unsupported audio type "${ext || file}". Gemini takes: ${Object.keys(AUDIO_MIME).join(", ")}`,
    );

  const { size } = await stat(file);
  process.stderr.write(
    `Reading ${basename(file)} (${(size / 1e6).toFixed(1)} MB)…\n`,
  );
  if (!upload && size <= INLINE_MAX_BYTES) {
    const bytes = await readFile(file);
    return {
      inline_data: { mime_type: mimeType, data: bytes.toString("base64") },
    };
  }

  const info = await uploadFile(file, mimeType, apiKey);
  process.stderr.write(
    `Uploaded as ${info.name} — ask again with --file-uri ${info.name}, ` +
      `then --delete ${info.name} when done (expires after 48h).\n`,
  );
  return { file_data: { mime_type: mimeType, file_uri: info.uri } };
}

/**
 * Build the audio part for a file already uploaded by an earlier run. The MIME
 * type comes from the server, so a bare `files/<id>` is enough to go on.
 * @param {string} name - Files API resource name, e.g. "files/abc123".
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<object>} A generateContent part.
 */
async function uploadedPart(name, apiKey) {
  const res = await fetch(`${API_ROOT}/v1beta/${name}?key=${apiKey}`);
  if (!res.ok)
    throw new Error(
      `Could not read ${name} (uploads expire after 48h): ${await res.text()}`,
    );
  const info = await res.json();
  if (info.state !== "ACTIVE")
    throw new Error(`Uploaded file ${name} is not ACTIVE (${info.state})`);
  return { file_data: { mime_type: info.mimeType, file_uri: info.uri } };
}

/**
 * Pull the `files/<id>` resource name out of a name or a full file URI.
 * @param {string} value - A resource name or URI.
 * @returns {string} The resource name.
 */
function fileRef(value) {
  const match = /files\/[A-Za-z0-9_-]+/.exec(value);
  if (!match)
    throw new Error(`Not an uploaded-file reference: "${value}" (files/<id>)`);
  return match[0];
}

/**
 * Upload a large file via the Files API and return it once it is ACTIVE (audio
 * must finish server-side processing before generateContent can use it).
 * @param {string} file - Path to the audio file.
 * @param {string} mimeType - Audio MIME type.
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<{name: string, uri: string}>} The uploaded file's resource
 *   name (for deleting it) and URI (for referencing it).
 */
async function uploadFile(file, mimeType, apiKey) {
  const bytes = await readFile(file);
  process.stderr.write(`Uploading via Files API…\n`);

  const startRes = await fetch(
    `${API_ROOT}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: basename(file) } }),
    },
  );
  if (!startRes.ok)
    throw new Error(`Files API start failed: ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Files API did not return an upload URL");

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  if (!upRes.ok)
    throw new Error(`Files API upload failed: ${await upRes.text()}`);
  const uploaded = await upRes.json();
  let fileInfo = uploaded.file;

  // Poll until the uploaded audio is ACTIVE.
  const deadline = Date.now() + 120_000;
  while (fileInfo.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(
      `${API_ROOT}/v1beta/${fileInfo.name}?key=${apiKey}`,
    );
    if (!poll.ok)
      throw new Error(`Files API poll failed: ${await poll.text()}`);
    fileInfo = await poll.json();
  }
  if (fileInfo.state !== "ACTIVE") {
    throw new Error(`Uploaded file not ACTIVE (state: ${fileInfo.state})`);
  }
  return fileInfo;
}

/**
 * Delete an uploaded file.
 * @param {string} name - Files API resource name, e.g. "files/abc123".
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<void>} Resolves once it's gone.
 */
async function deleteFile(name, apiKey) {
  const res = await fetch(`${API_ROOT}/v1beta/${name}?key=${apiKey}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Could not delete ${name}: ${await res.text()}`);
}

/**
 * Call generateContent with the prompt + audio part and return the text output.
 * @param {object} o - Options.
 * @param {string} o.apiKey - Gemini API key.
 * @param {string} o.model - Model id.
 * @param {string} o.prompt - Text prompt.
 * @param {object} o.audioPart - inline_data or file_data part.
 * @returns {Promise<string>} The concatenated text of the first candidate.
 */
async function generate({ apiKey, model, prompt, audioPart }) {
  const res = await fetch(
    `${API_ROOT}/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, audioPart] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`generateContent failed: ${await res.text()}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data)}`);
  return text;
}

try {
  await main();
} catch (err) {
  process.stderr.write(`Error: ${err.message ?? err}\n`);
  process.exit(1);
}
