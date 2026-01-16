import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("License embedding", () => {
  it("should have the current LICENSE embedded in the Max for Live device", () => {
    const licensePath = "LICENSE";
    const devicePath = "max-for-live-device/Producer_Pal.amxd";

    // Check files exist
    expect(existsSync(licensePath), `${licensePath} not found`).toBe(true);
    expect(existsSync(devicePath), `${devicePath} not found`).toBe(true);

    // Read the license file
    const licenseText = readFileSync(licensePath, "utf8").trim();

    // Read the device file
    const deviceContent = readFileSync(devicePath, "utf8");

    // Convert license text to JSON-escaped format (like what we see in the .amxd)
    const escapedLicense = licenseText
      .replaceAll("\\", "\\\\") // Escape backslashes
      .replaceAll('"', '\\"') // Escape quotes
      .replaceAll("\n", "\\n"); // Convert newlines to \n

    // Check if the escaped license text is in the device
    expect(
      deviceContent,
      `License text not found in ${devicePath}. 
      
Expected to find the contents of ${licensePath} embedded in the Max device.
This suggests the license in the Max patch comment needs to be updated.

To fix (a human must do this):
1. Open the Max for Live device in Max
2. Update the license text in a comment object 
3. Freeze the device
4. Run this test again

First few chars of expected license:
${escapedLicense.substring(0, 100)}...

First few chars found in device:
${deviceContent.substring(deviceContent.indexOf('"text"'), 200)}...`,
    ).toContain(escapedLicense);
  });
});
