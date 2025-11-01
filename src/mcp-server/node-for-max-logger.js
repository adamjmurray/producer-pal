import Max from "max-api";

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

const format = (loggerArgs) => `[${now()}] ${loggerArgs.join("\n")}`;

let verbose = false;

Max.addHandler(
  "verbose",
  // very intentionally doing a loose equality check `input == 1` here to support "1", literal true, [1], etc
  // eslint-disable-next-line eqeqeq
  (input) => (verbose = input == 1 || input === "true"),
);

export const log = (...any) => {
  Max.post(format(any));
};

export const info = (...any) => {
  if (verbose) Max.post(format(any));
};

export const warn = (...any) => {
  Max.post(format(any), Max.POST_LEVELS.WARN);
};

export const error = (...any) => {
  Max.post(format(any), Max.POST_LEVELS.ERROR);
};
