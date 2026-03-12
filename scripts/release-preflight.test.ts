import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import {
  ReleasePreflightError,
  extractCargoPackageVersion,
  formatGitHubOutputs,
  parseReleaseTag,
  runReleasePreflight,
  validateVersionAlignment
} from "./release-preflight.mjs";

async function createReleaseFixture(version: string): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "bg3dc-release-preflight-"));
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

describe("release preflight script", (): void => {
  const fixtureRoots: string[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      fixtureRoots.splice(0, fixtureRoots.length).map((fixtureRoot) =>
        rm(fixtureRoot, { force: true, recursive: true })
      )
    );
  });

  it("accepts a stable release tag without a leading v", (): void => {
    expect(parseReleaseTag("0.1.2")).toEqual({
      isPrerelease: false,
      version: "0.1.2"
    });
  });

  it("accepts a prerelease tag and marks it as prerelease", (): void => {
    expect(parseReleaseTag("0.1.2-beta.1")).toEqual({
      isPrerelease: true,
      version: "0.1.2-beta.1"
    });
  });

  it("rejects tags with a leading v", (): void => {
    expect(() => parseReleaseTag("v0.1.2")).toThrow(
      'Release tag "v0.1.2" must be a semantic version without a leading "v", for example 0.1.2 or 0.1.2-beta.1.'
    );
  });

  it("extracts the cargo package version from the package section", (): void => {
    expect(
      extractCargoPackageVersion(`[package]
name = "tauri-app"
version = "0.1.0"

[dependencies]
serde = "1"
`)
    ).toBe("0.1.0");
  });

  it("reports version alignment mismatches with file paths", (): void => {
    expect(() =>
      validateVersionAlignment({
        records: [
          {
            label: "workspace package.json",
            relativePath: "package.json",
            version: "0.1.0"
          },
          {
            label: "desktop package.json",
            relativePath: "apps/desktop-tauri/package.json",
            version: "0.1.1"
          }
        ],
        releaseVersion: "0.1.0"
      })
    ).toThrow(`Release version mismatch detected for tag 0.1.0:
- apps/desktop-tauri/package.json: found 0.1.1, expected 0.1.0`);
  });

  it("formats GitHub outputs for downstream workflow steps", (): void => {
    expect(
      formatGitHubOutputs({
        isPrerelease: true,
        tag: "0.1.2-beta.1",
        version: "0.1.2-beta.1"
      })
    ).toBe("tag=0.1.2-beta.1\nversion=0.1.2-beta.1\nis_prerelease=true");
  });

  it("runs the full preflight successfully when all versions match", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture("0.1.2");
    fixtureRoots.push(fixtureRoot);
    const outputPath = path.join(fixtureRoot, "github-output.txt");

    const result = await runReleasePreflight({
      argv: ["--cwd", fixtureRoot, "--tag", "0.1.2"],
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Validated release tag: 0.1.2");
  });

  it("fails the full preflight when one manifest drifts from the tag", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture("0.1.2");
    fixtureRoots.push(fixtureRoot);
    await writeFile(
      path.join(fixtureRoot, "apps", "desktop-tauri", "package.json"),
      JSON.stringify({ name: "@bg3dc/desktop-tauri", version: "0.1.3" }, null, 2),
      "utf8"
    );

    await expect(
      runReleasePreflight({
        argv: ["--cwd", fixtureRoot, "--tag", "0.1.2"]
      })
    ).rejects.toThrow(ReleasePreflightError);
  });
});
