#!/usr/bin/env node

// analyze-audio.mjs — send an audio file to Google's Gemini API and print the
// model's analysis. Zero dependencies (Node 18+ global fetch).
//
// Auth: set GEMINI_API_KEY in the environment (or pass --api-key). This is the
// whole reason audio analysis lives in a coding-agent skill instead of the
// Producer Pal device — the Max-for-Live runtime has no clean secrets story.
//
// Small files are sent inline; larger ones go through the Files API (upload,
// wait for ACTIVE, then reference). NOTE: model IDs and request limits move —
// override the model with --model / GEMINI_MODEL and check Google's docs.
//
// Usage:
//   node analyze-audio.mjs render.mp3
//   node analyze-audio.mjs render.mp3 --prompt "Describe the timbre and any mix issues."
//   GEMINI_MODEL=gemini-2.5-pro node analyze-audio.mjs render.mp3
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
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_PROMPT =
  "You are an audio engineer. Analyze this rendered audio: describe the " +
  "instrumentation and timbre, the overall character and mood, and flag any " +
  "obvious problems (clipping, noise, imbalance). Keep it concise.";

// Options that consume the following argument; everything else is positional.
const VALUE_OPTS = new Set(["--prompt", "-p", "--model", "--api-key"]);

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
  const file = positionals[0];
  if (!file)
    throw new Error(
      "Usage: node analyze-audio.mjs <audio-file> [--prompt <text>]",
    );

  const apiKey =
    opts["--api-key"] ?? process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key (set GEMINI_API_KEY or GEMINI_KEY, or pass --api-key).",
    );
  }
  const model = opts["--model"] ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const prompt = opts["--prompt"] ?? opts["-p"] ?? DEFAULT_PROMPT;
  const mimeType = AUDIO_MIME[extname(file).toLowerCase()] ?? "audio/wav";

  const { size } = await stat(file);
  process.stderr.write(
    `Analyzing ${basename(file)} (${(size / 1e6).toFixed(1)} MB) with ${model}…\n`,
  );

  const audioPart =
    size <= INLINE_MAX_BYTES
      ? await inlinePart(file, mimeType)
      : await filesApiPart(file, mimeType, apiKey);

  const text = await generate({ apiKey, model, prompt, audioPart });
  process.stdout.write(text + "\n");
}

/**
 * Build an inline_data part (base64) for a small audio file.
 * @param {string} file - Path to the audio file.
 * @param {string} mimeType - Audio MIME type.
 * @returns {Promise<object>} A generateContent part.
 */
async function inlinePart(file, mimeType) {
  const bytes = await readFile(file);
  const data = bytes.toString("base64");
  return { inline_data: { mime_type: mimeType, data } };
}

/**
 * Upload a large file via the Files API and return a file_data part once it is
 * ACTIVE (audio must finish server-side processing before generateContent).
 * @param {string} file - Path to the audio file.
 * @param {string} mimeType - Audio MIME type.
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<object>} A generateContent part referencing the uploaded file.
 */
async function filesApiPart(file, mimeType, apiKey) {
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
  return { file_data: { mime_type: mimeType, file_uri: fileInfo.uri } };
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
