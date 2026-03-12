import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { collectDeclaredVersions } from "./release-preflight.mjs";
import {
  parseCliArgs,
  runReleaseSyncVersion,
  updateCargoPackageVersion,
  updateJsonVersion
} from "./release-sync-version.mjs";

async function createReleaseFixture(version: string): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "bg3dc-release-sync-"));
  await mkdir(path.join(fixtureRoot, "apps", "desktop-tauri", "src-tauri"), {
    recursive: true
  });

  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "bg3dc-workspace", version }, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(fixtureRoot, "apps", "desktop-tauri", "package.json"),
    JSON.stringify({ name: "@bg3dc/desktop-tauri", version }, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(fixtureRoot, "apps", "desktop-tauri", "src-tauri", "tauri.conf.json"),
    JSON.stringify({ productName: "BG3calculator", version }, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(fixtureRoot, "apps", "desktop-tauri", "src-tauri", "Cargo.toml"),
    `[package]
name = "tauri-app"
version = "${version}"
edition = "2021"
`,
    "utf8"
  );

  return fixtureRoot;
}

describe("release sync version script", (): void => {
  const fixtureRoots: string[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      fixtureRoots.splice(0, fixtureRoots.length).map((fixtureRoot) =>
        rm(fixtureRoot, { force: true, recursive: true })
      )
    );
  });

  it("ignores a standalone -- argument from pnpm script forwarding", (): void => {
    expect(parseCliArgs(["--", "--tag", "0.1.2", "--dry-run"])).toEqual({
      cwd: null,
      dryRun: true,
      help: false,
      tag: "0.1.2"
    });
  });

  it("updates JSON manifest versions", (): void => {
    expect(updateJsonVersion('{"name":"demo","version":"0.1.0"}', "0.1.2")).toEqual({
      nextContents: `{
  "name": "demo",
  "version": "0.1.2"
}
`,
      previousVersion: "0.1.0"
    });
  });

  it("updates Cargo package versions inside the package section", (): void => {
    expect(
      updateCargoPackageVersion(`[package]
name = "tauri-app"
version = "0.1.0"

[dependencies]
serde = "1"
`, "0.1.2")
    ).toEqual({
      nextContents: `[package]
name = "tauri-app"
version = "0.1.2"

[dependencies]
serde = "1"
`,
      previousVersion: "0.1.0"
    });
  });

  it("writes the requested release version into every release manifest", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture("0.1.0");
    fixtureRoots.push(fixtureRoot);

    const result = await runReleaseSyncVersion({
      argv: ["--cwd", fixtureRoot, "--tag", "0.1.2"]
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Synchronized release version to 0.1.2");

    const records = await collectDeclaredVersions({ cwd: fixtureRoot });
    expect(records.map((record) => record.version)).toEqual([
      "0.1.2",
      "0.1.2",
      "0.1.2",
      "0.1.2"
    ]);
  });

  it("does not modify files during dry runs", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture("0.1.0");
    fixtureRoots.push(fixtureRoot);

    const result = await runReleaseSyncVersion({
      argv: ["--cwd", fixtureRoot, "--tag", "0.1.2", "--dry-run"]
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run: would synchronize release version to 0.1.2");

    const packageJsonContents = await readFile(path.join(fixtureRoot, "package.json"), "utf8");
    expect(packageJsonContents).toContain('"version": "0.1.0"');
  });
});
