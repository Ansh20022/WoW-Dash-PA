import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("preview discovery preserves nested components and ignores private files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  const sourcePath = path.join(root, "src/.generated/mockup-components.ts");
  const plugin = mockupPreviewPlugin();
  const addFile = async (file) => {
    const target = path.join(root, "src/components/mockups", file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "export default function Component() { return null; }\n");
    return target;
  };

  try {
    plugin.configResolved({ root });
    await plugin.buildStart();
    assert.match(await readFile(sourcePath, "utf8"), /export const modules: ModuleMap = \{\n\n\};/);

    await addFile("Overview.tsx");
    const nested = await addFile("nested/Details.tsx");
    await addFile("_Hidden.tsx");
    await addFile("_private/Secret.tsx");
    await addFile("nested/_private/Secret.tsx");
    await addFile("nested/_Helper.tsx");
    await addFile(".hidden/Secret.tsx");
    await addFile("helper.ts");
    await plugin.buildStart();

    const source = await readFile(sourcePath, "utf8");
    assert.match(source, /"\.\/components\/mockups\/Overview\.tsx": \(\) => import\("\.\.\/components\/mockups\/Overview\.tsx"\)/);
    assert.match(source, /"\.\/components\/mockups\/nested\/Details\.tsx": \(\) => import\("\.\.\/components\/mockups\/nested\/Details\.tsx"\)/);
    assert.equal((source.match(/\(\) => import\(/g) ?? []).length, 2);
    assert.doesNotMatch(source, /Hidden|Secret|Helper|helper/);

    await rm(nested);
    await plugin.buildStart();
    assert.doesNotMatch(await readFile(sourcePath, "utf8"), /Details/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
