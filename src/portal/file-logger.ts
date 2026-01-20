import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { errorMessage } from "#src/shared/error-utils.ts";

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
    return join(process.env.LOCALAPPDATA ?? homedir(), "ProducerPal", "Logs");
  }

  // Linux/Unix: follows XDG Base Directory specification
  return join(homedir(), ".local", "share", "Producer Pal", "logs");
})();

// Ensure directory exists (skip during tests or when logging disabled)
if (!isRunningInVitest && enableLogging) {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.error(`Failed to create log directory: ${errorMessage(error)}`);
  }
}

const LOG_FILE = join(
  LOG_DIR,
  `bridge-${new Date().toISOString().split("T")[0]}.log`,
);

/**
 * Write a log message to the log file
 * @param level - Log level (INFO, ERROR, DEBUG)
 * @param message - Message to log
 */
function writeLog(level: string, message: string): void {
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
    console.error(`Failed to write log: ${errorMessage(error)}`);
  }
}

export const logger = {
  /**
   * Log an info message
   * @param message - Log message
   * @returns void
   */
  info: (message: string): void => writeLog("INFO", message),
  /**
   * Log an error message
   * @param message - Log message
   * @returns void
   */
  error: (message: string): void => writeLog("ERROR", message),
  /**
   * Log a debug message (only when verbose logging enabled)
   * @param message - Log message
   */
  debug: (message: string): void => {
    if (verboseLogging && enableLogging) {
      writeLog("DEBUG", message);
    }
  },
};

// Log startup (skip during tests or when logging disabled)
if (!isRunningInVitest && enableLogging) {
  logger.info(`Bridge logger started - writing to ${LOG_FILE}`);
}
