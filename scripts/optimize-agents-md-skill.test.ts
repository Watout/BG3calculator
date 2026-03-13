import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("optimize-agents-md collaboration assets", (): void => {
  it("ships a repo-level AGENTS optimization skill with repository guardrails", (): void => {
    const skillPath = resolve(process.cwd(), ".agents/skills/optimize-agents-md/SKILL.md");

    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, "utf8");

    expect(content).toContain("name: optimize-agents-md");
    expect(content).toContain("AGENTS.md");
    expect(content).toContain("## Tool priority");
    expect(content).toContain("docsforcodex/agents-and-skills.md");
  });

  it("ships a concise AGENTS template and collaboration index doc", (): void => {
    const templatePath = resolve(
      process.cwd(),
      ".agents/skills/optimize-agents-md/references/concise-agents-template.md"
    );
    const docsPath = resolve(process.cwd(), "docsforcodex/agents-and-skills.md");

    expect(existsSync(templatePath)).toBe(true);
    expect(readFileSync(templatePath, "utf8")).toContain("## Tool routing");
    expect(existsSync(docsPath)).toBe(true);

    const docsContent = readFileSync(docsPath, "utf8");

    expect(docsContent).toContain("optimize-agents-md");
    expect(docsContent).toContain(".agents/skills");
    expect(docsContent).toContain("本地代码、`README.md`、`docsforcodex/*`");
  });
});
