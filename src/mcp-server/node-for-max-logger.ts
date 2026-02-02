import Max from "max-api";

const now = (): string => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

const format = (loggerArgs: unknown[]): string =>
  `[${now()}] ${loggerArgs.join("\n")}`;

let verbose = false;

Max.addHandler("verbose", (input: unknown) => (verbose = Boolean(input)));

export const log = (...args: unknown[]): void => {
  void Max.post(format(args));
};

export const info = (...args: unknown[]): void => {
  if (verbose) {
    void Max.post(format(args));
  }
};

export const warn = (...args: unknown[]): void => {
  void Max.post(format(args), Max.POST_LEVELS.WARN);
};

export const error = (...args: unknown[]): void => {
  void Max.post(format(args), Max.POST_LEVELS.ERROR);
};
