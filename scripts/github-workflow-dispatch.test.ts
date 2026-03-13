import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TIMEOUT_MINUTES,
  WorkflowDispatchError,
  buildRepositoryScopedTokenEnvNames,
  buildGitHubUrl,
  commitAllChangesIfNeeded,
  formatGitHubTokenRequirement,
  getGitHubToken,
  parseCliArgs,
  parseGitHubRepository,
  parseInputAssignment,
  selectWorkflowRun,
  validateExecutionContext,
  waitForWorkflowRun
} from "./github-workflow-dispatch.mjs";

describe("github workflow dispatch script", (): void => {
  it("parses workflow, inputs, auto-commit, no-push, and wait options", (): void => {
    expect(
      parseCliArgs([
        "--workflow",
        "create-release-tag.yml",
        "--input",
        "tag=0.1.8",
        "--input",
        "channel=stable",
        "--auto-commit",
        "--no-push",
        "--wait"
      ])
    ).toEqual({
      autoCommit: true,
      commitMessage: null,
      cwd: null,
      dryRun: false,
      help: false,
      inputs: {
        channel: "stable",
        tag: "0.1.8"
      },
      noPush: true,
      pollIntervalMs: 10_000,
      ref: null,
      repo: null,
      requireSuccess: false,
      timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
      wait: true,
      workflow: "create-release-tag.yml"
    });
  });

  it("parses workflow inputs as key value assignments", (): void => {
    expect(parseInputAssignment("tag=0.1.8")).toEqual({
      key: "tag",
      value: "0.1.8"
    });
  });

  it("rejects invalid workflow input assignments", (): void => {
    expect(() => parseInputAssignment("tag")).toThrow(
      'Invalid workflow input "tag". Expected key=value.'
    );
  });

  it("parses GitHub repository slugs from origin remotes", (): void => {
    expect(parseGitHubRepository("https://github.com/Watout/BG3calculator.git")).toBe(
      "Watout/BG3calculator"
    );
    expect(parseGitHubRepository("git@github.com:Watout/BG3calculator.git")).toBe(
      "Watout/BG3calculator"
    );
  });

  it("builds repository-scoped token environment variable names", (): void => {
    expect(buildRepositoryScopedTokenEnvNames("Watout/BG3calculator")).toEqual([
      "GH_TOKEN_BG3CALCULATOR",
      "GITHUB_TOKEN_BG3CALCULATOR",
      "GH_TOKEN_WATOUT_BG3CALCULATOR",
      "GITHUB_TOKEN_WATOUT_BG3CALCULATOR"
    ]);
  });

  it("prefers generic tokens but falls back to repository-scoped tokens", (): void => {
    expect(
      getGitHubToken(
        {
          GH_TOKEN_BG3CALCULATOR: "repo-token"
        },
        {
          repositorySlug: "Watout/BG3calculator"
        }
      )
    ).toBe("repo-token");

    expect(
      getGitHubToken(
        {
          GH_TOKEN: "generic-token",
          GH_TOKEN_BG3CALCULATOR: "repo-token"
        },
        {
          repositorySlug: "Watout/BG3calculator"
        }
      )
    ).toBe("generic-token");
  });

  it("formats token guidance with repository-scoped fallbacks", (): void => {
    expect(
      formatGitHubTokenRequirement({
        action: "dispatching workflows",
        repositorySlug: "Watout/BG3calculator"
      })
    ).toBe(
      "Set GH_TOKEN or GITHUB_TOKEN before dispatching workflows, or set a repository-scoped token: GH_TOKEN_BG3CALCULATOR, GITHUB_TOKEN_BG3CALCULATOR, GH_TOKEN_WATOUT_BG3CALCULATOR, GITHUB_TOKEN_WATOUT_BG3CALCULATOR."
    );
  });

  it("reports missing local dispatch prerequisites", (): void => {
    expect(
      validateExecutionContext({
        autoCommit: false,
        localBranch: "feature/test",
        noPush: false,
        ref: "main",
        repositorySlug: "",
        token: null,
        workingTreeStatus: " M README.md"
      })
    ).toEqual([
      "Set GH_TOKEN or GITHUB_TOKEN before dispatching workflows.",
      "Unable to resolve the GitHub repository slug from git origin or --repo.",
      'Check out branch "main" locally before dispatching from it. Current branch: feature/test.',
      "Commit or stash local changes before dispatching a workflow."
    ]);
  });

  it("rejects auto-commit when dispatching without pushing", (): void => {
    expect(
      validateExecutionContext({
        autoCommit: true,
        localBranch: "main",
        noPush: true,
        ref: "main",
        repositorySlug: "Watout/BG3calculator",
        token: "token",
        workingTreeStatus: ""
      })
    ).toEqual(["Auto-commit cannot be used together with --no-push."]);
  });

  it("stages and commits changes only when auto-commit is enabled", async (): Promise<void> => {
    const commandRunner = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: "" });

    await expect(
      commitAllChangesIfNeeded({
        autoCommit: false,
        commandRunner,
        commitMessage: "chore: test",
        cwd: "C:/repo",
        workingTreeStatus: " M package.json"
      })
    ).resolves.toBe(false);

    await expect(
      commitAllChangesIfNeeded({
        autoCommit: true,
        commandRunner,
        commitMessage: "chore: test",
        cwd: "C:/repo",
        workingTreeStatus: " M package.json"
      })
    ).resolves.toBe(true);
  });

  it("selects the newest matching workflow run", (): void => {
    const run = selectWorkflowRun(
      [
        {
          created_at: "2026-03-13T10:00:00Z",
          event: "push",
          head_branch: "main",
          head_sha: "sha-1",
          id: 1
        },
        {
          created_at: "2026-03-13T10:05:00Z",
          event: "workflow_dispatch",
          head_branch: "main",
          head_sha: "sha-1",
          id: 2
        },
        {
          created_at: "2026-03-13T10:07:00Z",
          event: "workflow_dispatch",
          head_branch: "main",
          head_sha: "sha-1",
          id: 4
        }
      ],
      {
        createdAfterMs: Date.parse("2026-03-13T10:04:00Z"),
        headSha: "sha-1",
        ref: "main"
      }
    );

    expect(run?.id).toBe(4);
  });

  it("waits until a successful workflow run finishes", async (): Promise<void> => {
    let nowValue = 0;

    const run = await waitForWorkflowRun({
      findRun: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          html_url: "https://github.com/run/77",
          id: 77,
          status: "queued"
        }),
      getRun: vi
        .fn()
        .mockResolvedValueOnce({
          html_url: "https://github.com/run/77",
          id: 77,
          status: "in_progress"
        })
        .mockResolvedValueOnce({
          conclusion: "success",
          html_url: "https://github.com/run/77",
          id: 77,
          status: "completed"
        }),
      now: () => nowValue,
      sleep: async () => {
        nowValue += 5_000;
      },
      timeoutMs: 20_000
    });

    expect(run.id).toBe(77);
    expect(run.conclusion).toBe("success");
  });

  it("times out while waiting for a workflow run", async (): Promise<void> => {
    let nowValue = 0;

    await expect(
      waitForWorkflowRun({
        findRun: async () => null,
        getRun: async () => {
          throw new WorkflowDispatchError("should not be called");
        },
        now: () => nowValue,
        sleep: async () => {
          nowValue += 10_000;
        },
        timeoutMs: 10_000
      })
    ).rejects.toThrow("Timed out while waiting for the GitHub Actions run to appear.");
  });

  it("builds GitHub URLs with search params", (): void => {
    expect(
      String(
        buildGitHubUrl("/repos/example/repo/actions/workflows/test.yml/runs", {
          branch: "main",
          event: "workflow_dispatch"
        })
      )
    ).toBe(
      "https://api.github.com/repos/example/repo/actions/workflows/test.yml/runs?branch=main&event=workflow_dispatch"
    );
  });
});
