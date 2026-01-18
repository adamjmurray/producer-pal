/**
 * Parse song time signature from live_set
 * @returns {{numerator: number, denominator: number}} Time signature components
 */
export function parseSongTimeSignature() {
  const liveSet = LiveAPI.from("live_set");

  return {
    numerator: /** @type {number} */ (
      liveSet.getProperty("signature_numerator")
    ),
    denominator: /** @type {number} */ (
      liveSet.getProperty("signature_denominator")
    ),
  };
}
