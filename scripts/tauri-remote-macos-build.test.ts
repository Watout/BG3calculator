import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  RemoteBuildError,
  TARGET_NAME,
  buildDefaultOutputDirectory,
  buildDispatchPayload,
  parseCliArgs,
  parseGitHubRepository,
  selectArtifact,
  selectWorkflowRun,
  validateExecutionContext,
  waitForArtifact,
  waitForWorkflowRun
} from "./tauri-remote-macos-build.mjs";

describe("tauri remote macOS build script", (): void => {
  it("parses CLI arguments for dry runs and custom output", (): void => {
    expect(
      parseCliArgs(["--dry-run", "--ref", "release/main", "--out-dir", "tmp/out", "--timeout-minutes", "42"])
    ).toEqual({
      dryRun: true,
      help: false,
      outDir: "tmp/out",
      ref: "release/main",
      timeoutMinutes: 42
    });
  });

  it("parses GitHub repository slugs from https and ssh remotes", (): void => {
    expect(parseGitHubRepository("https://github.com/Watout/BG3calculator.git")).toBe(
      "Watout/BG3calculator"
    );
    expect(parseGitHubRepository("git@github.com:Watout/BG3calculator.git")).toBe(
      "Watout/BG3calculator"
    );
  });

  it("fails fast when required local prerequisites are missing", (): void => {
    expect(
      validateExecutionContext({
        token: null,
        workingTreeStatus: " M README.md",
        localBranch: "main",
        ref: "main",
        localHeadSha: "abc1234",
        remoteHeadSha: "def5678",
        repositorySlug: ""
      })
    ).toEqual([
      "Set GH_TOKEN or GITHUB_TOKEN before running the remote macOS build.",
      "Unable to resolve the GitHub repository slug from origin or environment.",
      "Commit or stash local changes before dispatching a remote macOS build.",
      'Push branch "main" so origin matches local HEAD abc1234 before dispatching.'
    ]);
  });

  it("builds the default output directory under .artifacts", (): void => {
    expect(
      buildDefaultOutputDirectory({
        cwd: "C:/repo",
        requestId: "remote-macos-test"
      })
    ).toBe(path.join("C:/repo", ".artifacts", TARGET_NAME, "remote-macos-test"));
  });

  it("creates the workflow dispatch payload for the macOS target", (): void => {
    expect(
      buildDispatchPayload({
        ref: "main",
        requestId: "remote-macos-123"
      })
    ).toEqual({
      ref: "main",
      inputs: {
        request_id: "remote-macos-123",
        target: "macos-universal"
      }
    });
  });

  it("selects the newest matching workflow run for the requested commit", (): void => {
    const run = selectWorkflowRun(
      [
        {
          created_at: "2026-03-13T10:00:00Z",
          event: "push",
          head_branch: "main",
          head_sha: "sha-1"
        },
        {
          created_at: "2026-03-13T10:05:00Z",
          event: "workflow_dispatch",
          head_branch: "main",
          head_sha: "sha-1",
          id: 10
        },
        {
          created_at: "2026-03-13T10:06:00Z",
          event: "workflow_dispatch",
          head_branch: "feature",
          head_sha: "sha-1",
          id: 11
        },
        {
          created_at: "2026-03-13T10:07:00Z",
          event: "workflow_dispatch",
          head_branch: "main",
          head_sha: "sha-1",
          id: 12
        }
      ],
      {
        headSha: "sha-1",
        ref: "main",
        createdAfterMs: Date.parse("2026-03-13T10:04:00Z")
      }
    );

    expect(run?.id).toBe(12);
  });

  it("waits for the workflow run and returns the successful completion state", async (): Promise<void> => {
    let nowValue = 0;
    const run = await waitForWorkflowRun({
      timeoutMs: 20_000,
      now: () => nowValue,
      sleep: async () => {
        nowValue += 5_000;
      },
      findRun: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 77,
          html_url: "https://github.com/run/77",
          status: "queued"
        }),
      getRun: vi
        .fn()
        .mockResolvedValueOnce({
          id: 77,
          html_url: "https://github.com/run/77",
          status: "in_progress"
        })
        .mockResolvedValueOnce({
          conclusion: "success",
          html_url: "https://github.com/run/77",
          id: 77,
          status: "completed"
        })
    });

    expect(run.id).toBe(77);
    expect(run.conclusion).toBe("success");
  });

  it("reports failed remote runs with the run URL", async (): Promise<void> => {
    await expect(
      waitForWorkflowRun({
        timeoutMs: 1_000,
        now: () => 0,
        sleep: async () => undefined,
        findRun: async () => ({
          conclusion: "failure",
          html_url: "https://github.com/run/88",
          id: 88,
          status: "completed"
        }),
        getRun: async () => ({
          conclusion: "failure",
          html_url: "https://github.com/run/88",
          id: 88,
          status: "completed"
        })
      })
    ).rejects.toThrow('Remote macOS build finished with conclusion "failure". See https://github.com/run/88.');
  });

  it("times out while waiting for a workflow run", async (): Promise<void> => {
    let nowValue = 0;
    await expect(
      waitForWorkflowRun({
        timeoutMs: 10_000,
        now: () => nowValue,
        sleep: async () => {
          nowValue += 10_000;
        },
        findRun: async () => null,
        getRun: async () => {
          throw new RemoteBuildError("should not be called");
        }
      })
    ).rejects.toThrow("Timed out while waiting for the GitHub Actions run to appear.");
  });

  it("selects the first non-expired macOS artifact", (): void => {
    expect(
      selectArtifact([
        {
          created_at: "2026-03-13T10:00:00Z",
          expired: true,
          name: "bg3calculator-macos-universal"
        },
        {
          created_at: "2026-03-13T10:01:00Z",
          expired: false,
          id: 2,
          name: "bg3calculator-macos-universal"
        }
      ])
    ).toMatchObject({ id: 2 });
  });

  it("waits for the artifact to become available", async (): Promise<void> => {
    let nowValue = 0;
    const artifact = await waitForArtifact({
      now: () => nowValue,
      sleep: async () => {
        nowValue += 5_000;
      },
      listArtifacts: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            created_at: "2026-03-13T10:01:00Z",
            expired: false,
            id: 3,
            name: "bg3calculator-macos-universal"
          }
        ]),
      timeoutMs: 15_000
    });

    expect(artifact.id).toBe(3);
  });
});
