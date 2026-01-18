import Max from "max-api";
import { parseMaxBoolean } from "./max-input-helpers.js";

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

/**
 * @param {unknown[]} loggerArgs - Arguments to format
 * @returns {string} Formatted log message
 */
const format = (loggerArgs) => `[${now()}] ${loggerArgs.join("\n")}`;

let verbose = false;

Max.addHandler("verbose", (input) => (verbose = parseMaxBoolean(input)));

/** @param {unknown[]} args - Log arguments */
export const log = (...args) => {
  Max.post(format(args));
};

/** @param {unknown[]} args - Log arguments */
export const info = (...args) => {
  if (verbose) {
    Max.post(format(args));
  }
};

/** @param {unknown[]} args - Log arguments */
export const warn = (...args) => {
  Max.post(format(args), Max.POST_LEVELS.WARN);
};

/** @param {unknown[]} args - Log arguments */
export const error = (...args) => {
  Max.post(format(args), Max.POST_LEVELS.ERROR);
};
