import { describe, expect, it } from "vitest";

import {
  parseCliArgs,
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
});
