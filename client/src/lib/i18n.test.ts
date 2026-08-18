import { describe, expect, it } from "vitest";
import { interfaceCopy } from "./i18n";

describe("interface copy", () => {
  it("keeps Arabic and English interface keys aligned", () => {
    expect(Object.keys(interfaceCopy.ar).sort()).toEqual(Object.keys(interfaceCopy.en).sort());
  });

  it("keeps the requested developer credit at the interface footer", () => {
    expect(interfaceCopy.ar.developerCredit).toBe("devlopd by Oussama SEBROU");
    expect(interfaceCopy.en.developerCredit).toBe("devlopd by Oussama SEBROU");
  });
});
