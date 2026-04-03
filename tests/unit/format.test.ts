import { normalizePhone, normalizeState, normalizeZip, scoreLabel } from "@/lib/format";

describe("normalizePhone", () => {
  it("normalizes 10-digit US number", () => {
    expect(normalizePhone("4045550182")).toBe("+14045550182");
  });
  it("normalizes formatted number", () => {
    expect(normalizePhone("(404) 555-0182")).toBe("+14045550182");
  });
  it("normalizes 11-digit US number starting with 1", () => {
    expect(normalizePhone("14045550182")).toBe("+14045550182");
  });
  it("returns raw string for unrecognized formats", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });
});

describe("normalizeState", () => {
  it("uppercases and trims", () => {
    expect(normalizeState("  ga  ")).toBe("GA");
  });
  it("truncates to 2 chars", () => {
    expect(normalizeState("Georgia")).toBe("GE");
  });
});

describe("normalizeZip", () => {
  it("strips trailing content after space", () => {
    expect(normalizeZip("30303 ")).toBe("30303");
  });
  it("passes valid ZIP through", () => {
    expect(normalizeZip("30303")).toBe("30303");
  });
});

describe("scoreLabel", () => {
  it("returns Low Risk for score 0", () => {
    expect(scoreLabel(0)).toBe("Low Risk");
  });
  it("returns Low Risk for score 25", () => {
    expect(scoreLabel(25)).toBe("Low Risk");
  });
  it("returns Medium Risk for score 26", () => {
    expect(scoreLabel(26)).toBe("Medium Risk");
  });
  it("returns Medium Risk for score 60", () => {
    expect(scoreLabel(60)).toBe("Medium Risk");
  });
  it("returns High Risk for score 61", () => {
    expect(scoreLabel(61)).toBe("High Risk");
  });
  it("returns High Risk for score 100", () => {
    expect(scoreLabel(100)).toBe("High Risk");
  });
});
