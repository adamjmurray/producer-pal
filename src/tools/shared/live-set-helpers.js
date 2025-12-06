/**
 * Parse song time signature from live_set
 * @returns {{numerator: number, denominator: number}} Time signature components
 */
export function parseSongTimeSignature() {
  const liveSet = new LiveAPI("live_set");

  return {
    numerator: liveSet.getProperty("signature_numerator"),
    denominator: liveSet.getProperty("signature_denominator"),
  };
}
