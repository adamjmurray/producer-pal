import Max from "max-api";
import { parseMaxBoolean } from "./max-input-helpers.js";

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

const format = (loggerArgs) => `[${now()}] ${loggerArgs.join("\n")}`;

let verbose = false;

Max.addHandler("verbose", (input) => (verbose = parseMaxBoolean(input)));

export const log = (...any) => {
  Max.post(format(any));
};

export const info = (...any) => {
  if (verbose) {
    Max.post(format(any));
  }
};

export const warn = (...any) => {
  Max.post(format(any), Max.POST_LEVELS.WARN);
};

export const error = (...any) => {
  Max.post(format(any), Max.POST_LEVELS.ERROR);
};
