import { appendFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Check logging environment variables
const enableLogging = process.env.ENABLE_LOGGING === "true";
const verboseLogging = process.env.VERBOSE_LOGGING === "true";

// Detect if running under Vitest to avoid file operations during tests
const isRunningInVitest = process.env.VITEST === "true";

// Platform-specific log directories
const LOG_DIR = (() => {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Logs", "Producer Pal");
  } else if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || homedir(), "ProducerPal", "Logs");
  } else {
    // Linux/Unix: follows XDG Base Directory specification
    return join(homedir(), ".local", "share", "Producer Pal", "logs");
  }
})();

// Ensure directory exists (skip during tests or when logging disabled)
if (!isRunningInVitest && enableLogging) {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.error(`Failed to create log directory: ${error.message}`);
  }
}

const LOG_FILE = join(
  LOG_DIR,
  `bridge-${new Date().toISOString().split("T")[0]}.log`,
);

function writeLog(level, message) {
  // Skip file operations when running under Vitest or when logging disabled
  if (isRunningInVitest || !enableLogging) {
    return;
  }

  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${level}] ${message}\n`;

  try {
    appendFileSync(LOG_FILE, line);
  } catch (error) {
    // Don't throw - we're probably already in an error state
    console.error(`Failed to write log: ${error.message}`);
  }
}

export const logger = {
  info: (message) => writeLog("INFO", message),
  error: (message) => writeLog("ERROR", message),
  debug: (message) => {
    if (verboseLogging && enableLogging) {
      writeLog("DEBUG", message);
    }
  },
};

// Log startup (skip during tests or when logging disabled)
if (!isRunningInVitest && enableLogging) {
  logger.info(`Bridge logger started - writing to ${LOG_FILE}`);
}
