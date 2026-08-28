import { personaConfig } from "./persona";

describe("personaConfig", () => {
  it("returns a full config for a known persona", () => {
    const cfg = personaConfig("student");
    expect(cfg).not.toBeNull();
    expect(Array.isArray(cfg.chips)).toBe(true);
    expect(cfg.cardOrder).toContain("project");
    expect(cfg.featureOrder.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown or missing persona", () => {
    expect(personaConfig("nope")).toBeNull();
    expect(personaConfig(undefined)).toBeNull();
    expect(personaConfig(null)).toBeNull();
  });
});
