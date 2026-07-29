// cli.mjs — the `--flag value` parsing every generator script repeats.
// Node 18+ built-ins only, no npm.
//
// Range-checking matters more here than in a normal CLI: these numbers scale
// buffers and fill header fields. Out of range, they produce silent files,
// or allocate until the process hangs — neither of which looks like a bad
// argument when you hear it.

/**
 * Build flag readers bound to an argument list.
 * @param {string[]} [argv] defaults to this process's arguments
 * @returns {{opt: Function, num: Function, int: Function, flag: Function, fail: Function}} readers
 */
export function parseArgs(argv = process.argv.slice(2)) {
  /**
   * Print a message and exit non-zero.
   * @param {string} msg what went wrong
   * @returns {never} exits
   */
  const fail = (msg) => {
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  };

  /**
   * Read a string flag. A flag with no value — last token, or immediately
   * followed by another --flag — is a malformed invocation, not a request for
   * the default, so say so instead of handing back undefined.
   * @param {string} name flag including the leading dashes
   * @param {string} [def] value when the flag is absent
   * @returns {string} the flag's value
   */
  const opt = (name, def) => {
    const i = argv.indexOf(name);

    if (i < 0) return def;

    const v = argv[i + 1];

    if (v == null || v.startsWith("--")) fail(`Missing value for ${name}`);

    return v;
  };

  /**
   * Read a numeric flag, rejecting NaN, Infinity, and out-of-range values.
   * @param {string} name flag including the leading dashes
   * @param {number} def value when the flag is absent
   * @param {number} min lowest accepted value, inclusive
   * @param {number} max highest accepted value, inclusive
   * @returns {number} the flag's value
   */
  const num = (name, def, min, max) => {
    const raw = opt(name, def);
    const v = Number(raw);

    if (!Number.isFinite(v) || v < min || v > max) {
      fail(`${name} must be a number from ${min} to ${max}, got "${raw}"`);
    }

    return v;
  };

  /**
   * Read a whole-number flag. Sample rates and frame sizes fill integer header
   * fields, where a fraction is silently truncated while the DSP keeps running
   * at the untruncated value.
   * @param {string} name flag including the leading dashes
   * @param {number} def value when the flag is absent
   * @param {number} min lowest accepted value, inclusive
   * @param {number} max highest accepted value, inclusive
   * @returns {number} the flag's value
   */
  const int = (name, def, min, max) => {
    const v = num(name, def, min, max);

    if (!Number.isInteger(v))
      fail(`${name} must be a whole number, got "${v}"`);

    return v;
  };

  /**
   * Test for a bare presence flag such as --mono.
   * @param {string} name flag including the leading dashes
   * @returns {boolean} whether it appeared
   */
  const flag = (name) => argv.includes(name);

  return { opt, num, int, flag, fail };
}
