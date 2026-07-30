import { describe, expect, it } from "vitest";
import { parseAdventureOptions, validateBenchmarksCoverage } from "../src/scraper.js";

describe("scraper helpers", () => {
  it("parses adventure options from the qualifiers selector", () => {
    const result = parseAdventureOptions([
      { value: "qualifiers", label: "Qualifiers" },
      { value: "10100", label: "Whitetail" },
      { value: "11200", label: "Mountain Goat" },
      { value: "", label: "" },
    ]);

    expect(result).toEqual([
      { id: "10100", animal: "Whitetail" },
      { id: "11200", animal: "Mountain Goat" },
    ]);
  });

  it("accepts complete benchmark coverage for every weapon and trek", () => {
    expect(() =>
      validateBenchmarksCoverage(
        [
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 1" },
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 2" },
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 3" },
          { animal: "Wildebeest", weapon: "Bow", trek: "Trek 1" },
          { animal: "Wildebeest", weapon: "Bow", trek: "Trek 2" },
          { animal: "Wildebeest", weapon: "Bow", trek: "Trek 3" },
        ],
        [{ id: "10500", animal: "Wildebeest" }],
      ),
    ).not.toThrow();
  });

  it("fails when a trek benchmark is missing for an adventure", () => {
    expect(() =>
      validateBenchmarksCoverage(
        [
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 1" },
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 2" },
          { animal: "Wildebeest", weapon: "Gun", trek: "Trek 3" },
          { animal: "Wildebeest", weapon: "Bow", trek: "Trek 1" },
          { animal: "Wildebeest", weapon: "Bow", trek: "Trek 3" },
        ],
        [{ id: "10500", animal: "Wildebeest" }],
      ),
    ).toThrow("Wildebeest Bow Trek 2");
  });
});
