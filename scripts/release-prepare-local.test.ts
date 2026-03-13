import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BRANCH,
  DEFAULT_REMOTE,
  ensureCleanOrAutoCommit,
  ensureTagAvailable,
  parseCliArgs,
  runReleasePrepareLocal
} from "./release-prepare-local.mjs";

describe("release prepare local script", (): void => {
  it("parses tag, branch, remote, auto-commit, and dry-run options", (): void => {
    expect(
      parseCliArgs([
        "--tag",
        "0.1.8",
        "--branch",
        "main",
        "--remote",
        "upstream",
        "--auto-commit",
        "--dry-run"
      ])
    ).toEqual({
      autoCommit: true,
      branch: "main",
      commitMessage: null,
      dryRun: true,
      help: false,
      remote: "upstream",
      tag: "0.1.8"
    });
  });

  it("uses the default branch and remote", (): void => {
    expect(parseCliArgs(["--tag", "0.1.8"])).toEqual({
      autoCommit: false,
      branch: DEFAULT_BRANCH,
      commitMessage: null,
      dryRun: false,
      help: false,
      remote: DEFAULT_REMOTE,
      tag: "0.1.8"
    });
  });

  it("rejects existing remote tags", async (): Promise<void> => {
    const commandRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: "",
        stdout: "sha\trefs/tags/0.1.8"
      });

    await expect(
      ensureTagAvailable(commandRunner, {
        cwd: "C:/repo",
        remote: "origin",
        tag: "0.1.8"
      })
    ).rejects.toThrow("Remote tag 0.1.8 already exists. Bump to a new version instead of reusing it.");
  });

  it("auto-commits the working tree only when explicitly enabled", async (): Promise<void> => {
    const cleanRunner = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: " M README.md" });

    await expect(
      ensureCleanOrAutoCommit({
        autoCommit: false,
        commandRunner: cleanRunner,
        commitMessage: null,
        cwd: "C:/repo"
      })
    ).rejects.toThrow(
      "Working tree must be clean before running release:prepare-local, or pass --auto-commit."
    );

    const autoCommitRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: " M README.md" })
      .mockResolvedValue({ exitCode: 0, stderr: "", stdout: "" });

    await expect(
      ensureCleanOrAutoCommit({
        autoCommit: true,
        commandRunner: autoCommitRunner,
        commitMessage: "chore: local handoff",
        cwd: "C:/repo"
      })
    ).resolves.toBe(true);
  });

  it("returns a dry-run summary without mutating git state", async (): Promise<void> => {
    const commandRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "main\n" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "abcdef1234567890\n" });

    const result = await runReleasePrepareLocal({
      argv: ["--tag", "0.1.8", "--dry-run"],
      commandRunner,
      cwd: "C:/repo"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Validated local release 0.1.8.");
    expect(result.stdout).toContain("Head SHA: abcdef1234567890");
    expect(commandRunner).toHaveBeenCalledTimes(5);
  });

  it("rejects invalid semver tags", async (): Promise<void> => {
    await expect(
      runReleasePrepareLocal({
        argv: ["--tag", "v0.1.8"],
        commandRunner: vi.fn(),
        cwd: "C:/repo"
      })
    ).rejects.toThrow(
      'Release tag "v0.1.8" must be a semantic version without a leading "v", for example 0.1.2 or 0.1.2-beta.1.'
    );
  });

  it("surfaces remote lookup failures", async (): Promise<void> => {
    const commandRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "main\n" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
      .mockResolvedValueOnce({
        exitCode: 2,
        stderr: "fatal: remote error",
        stdout: ""
      });

    await expect(
      runReleasePrepareLocal({
        argv: ["--tag", "0.1.8", "--dry-run"],
        commandRunner,
        cwd: "C:/repo"
      })
    ).rejects.toThrow("Unable to query remote tag 0.1.8: fatal: remote error");
  });
});
