import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findTypeScriptFiles(fullPath);
      }
      return entry.isFile() && fullPath.endsWith(".ts") ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

describe("API rate limit usage", () => {
  it("awaits every enforceRateLimit call", async () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const files = await findTypeScriptFiles(apiRoot);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        if (
          line.includes("enforceRateLimit({") &&
          !line.includes("await enforceRateLimit({")
        ) {
          violations.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
