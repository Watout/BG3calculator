import { describe, expect, it } from "vitest";

import {
  CREATE_RELEASE_TAG_WORKFLOW,
  parseCliArgs,
  runReleasePrepare,
  validateTagCollisionState
} from "./release-prepare.mjs";

describe("release prepare entry script", (): void => {
  it("parses the supported options and forwarded standalone --", (): void => {
    expect(parseCliArgs(["--", "--tag", "0.1.8", "--wait", "--dry-run"])).toEqual({
      dryRun: true,
      help: false,
      tag: "0.1.8",
      timeoutMinutes: 20,
      wait: true
    });
  });

  it("blocks remote tag reuse", (): void => {
    expect(() =>
      validateTagCollisionState({
        remoteTagExists: true
      })
    ).toThrow(
      "Remote tag already exists. Bump to a brand new release version before continuing."
    );
  });

  it("ignores local-only tag state because release:prepare never creates tags locally", (): void => {
    expect(() =>
      validateTagCollisionState({
        remoteTagExists: false
      })
    ).not.toThrow();
  });

  it("dispatches the remote tag workflow in dry-run mode without pushing", async (): Promise<void> => {
    const commandRunner = async (
      command: string,
      args: string[]
    ): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
      const key = `${command} ${args.join(" ")}`;

      switch (key) {
        case "git remote get-url origin":
          return {
            exitCode: 0,
            stderr: "",
            stdout: "https://github.com/Watout/BG3calculator.git\n"
          };
        case "git ls-remote --tags origin refs/tags/0.1.8":
          return {
            exitCode: 0,
            stderr: "",
            stdout: ""
          };
        case "git rev-parse --abbrev-ref HEAD":
          return {
            exitCode: 0,
            stderr: "",
            stdout: "main\n"
          };
        case "git status --short":
          return {
            exitCode: 0,
            stderr: "",
            stdout: ""
          };
        case "git rev-parse HEAD":
          return {
            exitCode: 0,
            stderr: "",
            stdout: "abcdef1234567890\n"
          };
        case "git ls-remote --exit-code origin refs/heads/main":
          return {
            exitCode: 0,
            stderr: "",
            stdout: "abcdef1234567890\trefs/heads/main\n"
          };
        default:
          throw new Error(`Unexpected command: ${key}`);
      }
    };

    const result = await runReleasePrepare({
      argv: ["--tag", "0.1.8", "--dry-run"],
      commandRunner,
      cwd: process.cwd(),
      env: {
        GITHUB_TOKEN_BG3CALCULATOR: "repo-token"
      },
      fetchImpl: async () => {
        throw new Error("fetch should not be called in dry-run mode");
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Release entry: remote-tag-workflow");
    expect(result.stdout).toContain(`Workflow: ${CREATE_RELEASE_TAG_WORKFLOW}`);
    expect(result.stdout).toContain("Push before dispatch: disabled");
    expect(result.stdout).toContain("Remote HEAD SHA: abcdef1234567890");
  });

  it("rejects invalid semver tags", async (): Promise<void> => {
    await expect(
      runReleasePrepare({
        argv: ["--tag", "v0.1.8"],
        commandRunner: async () => {
          throw new Error("command runner should not be called");
        },
        cwd: "C:/repo"
      })
    ).rejects.toThrow(
      'Release tag "v0.1.8" must be a semantic version without a leading "v", for example 0.1.2 or 0.1.2-beta.1.'
    );
  });
});
