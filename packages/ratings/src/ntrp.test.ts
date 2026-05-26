import { describe, expect, it } from "vitest";
import { fitCalibration, glickoToNtrp, predictLevel } from "./ntrp";

describe("NTRP calibration", () => {
  it("recovers a known linear relationship", () => {
    // Synthetic: NTRP = 0.005 * (glicko - 1000) + 2.5, with small noise.
    const labels = Array.from({ length: 200 }, (_, i) => {
      const glicko = 1000 + i * 5; // 1000 - 1995
      const noise = (Math.sin(i) * 0.05);
      const ntrp = 0.005 * (glicko - 1000) + 2.5 + noise;
      return { glickoRating: glicko, ntrpLevel: ntrp };
    });
    const cal = fitCalibration(labels);
    expect(cal.slope).toBeCloseTo(0.005, 3);
    expect(cal.rmse).toBeLessThan(0.1);
  });

  it("glickoToNtrp inverts the fit", () => {
    const labels = [
      { glickoRating: 1200, ntrpLevel: 3.0 },
      { glickoRating: 1400, ntrpLevel: 3.5 },
      { glickoRating: 1600, ntrpLevel: 4.0 },
      { glickoRating: 1800, ntrpLevel: 4.5 },
      { glickoRating: 2000, ntrpLevel: 5.0 },
      { glickoRating: 1300, ntrpLevel: 3.25 },
      { glickoRating: 1500, ntrpLevel: 3.75 },
      { glickoRating: 1700, ntrpLevel: 4.25 },
      { glickoRating: 1900, ntrpLevel: 4.75 },
      { glickoRating: 1100, ntrpLevel: 2.75 },
    ];
    const cal = fitCalibration(labels);
    expect(glickoToNtrp(1500, cal)).toBeCloseTo(3.75, 1);
  });

  it("predictLevel applies hysteresis correctly", () => {
    // Within band: stay
    expect(predictLevel(3.7, 3.5)).toBe(3.5);
    // Clearly above: bump up
    expect(predictLevel(4.05, 3.5)).toBe(4.0);
    // Clearly below: bump down
    expect(predictLevel(2.95, 3.5)).toBe(3.0);
    // Right at threshold without hysteresis would bump; with it, stays
    expect(predictLevel(3.95, 3.5, 0.1)).toBe(4.0);
    expect(predictLevel(3.91, 3.5, 0.1)).toBe(4.0);
    expect(predictLevel(3.85, 3.5, 0.1)).toBe(3.5);
  });

  it("rejects too few labels", () => {
    expect(() => fitCalibration([{ glickoRating: 1500, ntrpLevel: 4 }])).toThrow();
  });
});
