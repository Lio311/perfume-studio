import { describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value.replaceAll("&", "&amp;") },
}));
import { duplicateSlugIssues } from "./packValidate.ts";
import { generatedPartId, partFromDraft } from "./registry.ts";
import type { DraftItem } from "./parseCatalog.ts";

const draft = {
  id: "row",
  page: 1,
  kind: "cap",
  neck: "FEA15",
  widthMm: 30,
  heightMm: 32,
  depthMm: 30,
  capacityMl: null,
  profile: "cylinder",
  crop: { x: 0, y: 0, w: 1, h: 1 },
  confidence: 0.2,
  manual: true,
} satisfies Omit<DraftItem, "code">;

describe("generated part ids", () => {
  it("treats a sanitised ampersand code as the same id as its slug", () => {
    const supplier = { id: "sup-lab", name: "Lab" };
    const fromAmp = partFromDraft({ ...draft, code: "a & b" }, supplier, 0);
    const fromSlug = partFromDraft({ ...draft, code: "a-amp-b" }, supplier, 1);
    expect(fromAmp.code).toBe("a &amp; b");
    expect(fromAmp.id).toBe("sup-lab-a-amp-b");
    expect(fromSlug.id).toBe(fromAmp.id);
    expect(fromAmp.id).toBe(generatedPartId(supplier.id, "a & b", "cap", 0));
    const rows = [
      { id: "row-1", code: "a & b", kind: "cap" },
      { id: "row-2", code: "a-amp-b", kind: "cap" },
    ];
    expect(duplicateSlugIssues(rows[1], rows)[0]?.he).toContain("a-amp-b");
    expect(duplicateSlugIssues(rows[0], rows)).toHaveLength(1);
  });

  it("catches an empty slug that falls back to the same item-N id", () => {
    const supplier = { id: "sup-lab", name: "Lab" };
    expect(partFromDraft({ ...draft, code: "***" }, supplier, 0).id).toBe("sup-lab-item-1");
    expect(partFromDraft({ ...draft, code: "item-1" }, supplier, 1).id).toBe("sup-lab-item-1");
    const rows = [
      { id: "row-1", code: "***", kind: "cap" },
      { id: "row-2", code: "item-1", kind: "cap" },
    ];
    expect(duplicateSlugIssues(rows[0], rows)).toHaveLength(1);
    expect(duplicateSlugIssues(rows[1], rows)).toHaveLength(1);
    expect(duplicateSlugIssues(rows[0], [rows[0]])).toEqual([]);
  });
});
