import { describe, expect, it } from "vitest";

import {
  parseCliArgs,
  runReleasePrepare,
  selectReleasePath,
  validateTagCollisionState
} from "./release-prepare.mjs";

describe("release prepare entry script", (): void => {
  it("parses auto mode and forwarded standalone --", (): void => {
    expect(
      parseCliArgs(["--", "--tag", "0.1.8", "--mode", "auto", "--wait", "--auto-commit"])
    ).toEqual({
      autoCommit: true,
      commitMessage: null,
      dryRun: false,
      help: false,
      mode: "auto",
      timeoutMinutes: 20,
      wait: true,
      tag: "0.1.8"
    });
  });

  it("prefers dispatch mode only when a workflow exists and a token is available", (): void => {
    expect(
      selectReleasePath({
        hasDispatchWorkflow: true,
        mode: "auto",
        token: "token"
      })
    ).toBe("dispatch");

    expect(
      selectReleasePath({
        hasDispatchWorkflow: true,
        mode: "auto",
        token: null
      })
    ).toBe("manual");
  });

  it("blocks remote tag reuse for all paths", (): void => {
    expect(() =>
      validateTagCollisionState({
        localTagExists: false,
        path: "dispatch",
        remoteTagExists: true
      })
    ).toThrow(
      "Remote tag already exists. Bump to a brand new release version before continuing."
    );
  });

  it("allows dispatch mode to ignore a local-only tag collision", (): void => {
    expect(() =>
      validateTagCollisionState({
        localTagExists: true,
        path: "dispatch",
        remoteTagExists: false
      })
    ).not.toThrow();
  });

  it("still blocks local tag reuse on the manual fallback path", (): void => {
    expect(() =>
      validateTagCollisionState({
        localTagExists: true,
        path: "manual",
        remoteTagExists: false
      })
    ).toThrow(
      "Local tag already exists. Delete the local tag or bump to a new release version before running the manual path."
    );
  });

  it("auto mode detects repository-scoped tokens for dispatch dry runs", async (): Promise<void> => {
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
        case "git tag --list 0.1.8":
          return {
            exitCode: 0,
            stderr: "",
            stdout: ""
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
    expect(result.stdout).toContain("Selected path: dispatch");
    expect(result.stdout).toContain("Workflow: prepare-release.yml");
  });
});
