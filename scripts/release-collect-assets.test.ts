import { describe, expect, it } from "vitest";

import {
  ReleaseAssetError,
  collectReleaseAssets,
  formatGitHubOutputFiles,
  isReleaseAsset
} from "./release-collect-assets.mjs";

describe("release asset collection script", (): void => {
  it("recognizes allowed release asset file names", (): void => {
    expect(isReleaseAsset("bg3calculator-windows-x64/app.msi")).toBe(true);
    expect(isReleaseAsset("bg3calculator-macos-universal/app.dmg")).toBe(true);
    expect(isReleaseAsset("bg3calculator-macos-universal/app.app.tar.gz")).toBe(true);
    expect(isReleaseAsset("bg3calculator-macos-universal/notes.txt")).toBe(false);
  });

  it("collects release assets in stable sorted order", (): void => {
    expect(
      collectReleaseAssets(
        [
          "bg3calculator-windows-x64/b/app.exe",
          "bg3calculator-macos-universal/a/app.dmg",
          "bg3calculator-windows-x64/a/app.msi",
          "bg3calculator-macos-universal/extra/app.sig",
          "bg3calculator-macos-universal/notes.txt"
        ],
        {
          rootDir: "release-assets"
        }
      )
    ).toEqual([
      "release-assets/bg3calculator-macos-universal/a/app.dmg",
      "release-assets/bg3calculator-macos-universal/extra/app.sig",
      "release-assets/bg3calculator-windows-x64/a/app.msi",
      "release-assets/bg3calculator-windows-x64/b/app.exe"
    ]);
  });

  it("fails when no release assets are found", (): void => {
    expect(() =>
      collectReleaseAssets(["bg3calculator-macos-universal/notes.txt"], {
        rootDir: "release-assets"
      })
    ).toThrow("No release files were found in the downloaded artifacts.");
  });

  it("fails when a required asset group is missing", (): void => {
    expect(() =>
      collectReleaseAssets(
        [
          "bg3calculator-windows-x64/app.exe",
          "bg3calculator-macos-universal/app.dmg"
        ],
        {
          rootDir: "release-assets"
        }
      )
    ).toThrow('Missing required release asset group "windows-msi" from downloaded artifacts.');
  });

  it("formats GitHub Actions multiline output correctly", (): void => {
    expect(
      formatGitHubOutputFiles([
        "release-assets/bg3calculator-macos-universal/app.dmg",
        "release-assets/bg3calculator-windows-x64/app.msi"
      ])
    ).toBe(
      "files<<EOF\nrelease-assets/bg3calculator-macos-universal/app.dmg\nrelease-assets/bg3calculator-windows-x64/app.msi\nEOF"
    );
  });
});
