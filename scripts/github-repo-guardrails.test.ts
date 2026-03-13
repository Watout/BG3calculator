import { describe, expect, it } from "vitest";

import {
  GENERIC_GITHUB_TOKEN_ENV_NAMES,
  GITHUB_ACTIONS_APP_ID,
  MAIN_BRANCH_REQUIRED_CHECKS,
  RELEASE_TAG_PATTERN,
  RELEASE_TAG_RULESET_NAME,
  applyGitHubRepoGuardrails,
  buildGuardrailsTokenEnvNames,
  buildLegacyAdministrationTokenEnvNames,
  buildMainBranchProtectionPayload,
  buildPersonalRepoReleaseTagRulesetPayload,
  buildStrictReleaseTagRulesetPayload,
  formatAdministrationTokenRequirement,
  getGitHubAdministrationToken,
  normalizeGuardrailPermissionError,
  parseCliArgs
} from "./github-repo-guardrails.mjs";

describe("github repository guardrails script", (): void => {
  it("parses dry-run and repo options", (): void => {
    expect(
      parseCliArgs(["--", "--repo", "Watout/BG3calculator", "--cwd", "C:/repo", "--dry-run"])
    ).toEqual({
      cwd: "C:/repo",
      dryRun: true,
      help: false,
      repo: "Watout/BG3calculator"
    });
  });

  it("builds preferred guardrails token env names", (): void => {
    expect(GENERIC_GITHUB_TOKEN_ENV_NAMES).toEqual(["GH_TOKEN", "GITHUB_TOKEN"]);
    expect(buildGuardrailsTokenEnvNames("Watout/BG3calculator")).toEqual([
      "GH_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN_BG3CALCULATOR",
      "GITHUB_TOKEN_BG3CALCULATOR",
      "GH_TOKEN_WATOUT_BG3CALCULATOR",
      "GITHUB_TOKEN_WATOUT_BG3CALCULATOR"
    ]);
  });

  it("builds legacy admin token aliases", (): void => {
    expect(buildLegacyAdministrationTokenEnvNames("Watout/BG3calculator")).toEqual([
      "GH_ADMIN_TOKEN",
      "GITHUB_ADMIN_TOKEN",
      "GH_ADMIN_TOKEN_BG3CALCULATOR",
      "GITHUB_ADMIN_TOKEN_BG3CALCULATOR",
      "GH_ADMIN_TOKEN_WATOUT_BG3CALCULATOR",
      "GITHUB_ADMIN_TOKEN_WATOUT_BG3CALCULATOR"
    ]);
  });

  it("prefers generic repository tokens but still accepts legacy admin aliases", (): void => {
    expect(
      getGitHubAdministrationToken(
        {
          GITHUB_ADMIN_TOKEN_BG3CALCULATOR: "admin-token",
          GITHUB_TOKEN_BG3CALCULATOR: "dispatch-token"
        },
        {
          repositorySlug: "Watout/BG3calculator"
        }
      )
    ).toEqual({
      source: "GITHUB_TOKEN_BG3CALCULATOR",
      token: "dispatch-token"
    });

    expect(
      getGitHubAdministrationToken(
        {
          GITHUB_TOKEN_BG3CALCULATOR: "dispatch-token"
        },
        {
          repositorySlug: "Watout/BG3calculator"
        }
      )
    ).toEqual({
      source: "GITHUB_TOKEN_BG3CALCULATOR",
      token: "dispatch-token"
    });

    expect(
      getGitHubAdministrationToken(
        {
          GITHUB_ADMIN_TOKEN_BG3CALCULATOR: "admin-token"
        },
        {
          repositorySlug: "Watout/BG3calculator"
        }
      )
    ).toEqual({
      source: "GITHUB_ADMIN_TOKEN_BG3CALCULATOR",
      token: "admin-token"
    });
  });

  it("formats administration token guidance", (): void => {
    expect(
      formatAdministrationTokenRequirement({
        repositorySlug: "Watout/BG3calculator"
      })
    ).toBe(
      "Set one GitHub token with repository Administration permission before applying GitHub repository guardrails. Preferred env names: GH_TOKEN, GITHUB_TOKEN, GH_TOKEN_BG3CALCULATOR, GITHUB_TOKEN_BG3CALCULATOR, GH_TOKEN_WATOUT_BG3CALCULATOR, GITHUB_TOKEN_WATOUT_BG3CALCULATOR. Legacy admin aliases are also accepted: GH_ADMIN_TOKEN, GITHUB_ADMIN_TOKEN, GH_ADMIN_TOKEN_BG3CALCULATOR, GITHUB_ADMIN_TOKEN_BG3CALCULATOR, GH_ADMIN_TOKEN_WATOUT_BG3CALCULATOR, GITHUB_ADMIN_TOKEN_WATOUT_BG3CALCULATOR."
    );
  });

  it("builds the protected main branch payload", (): void => {
    expect(buildMainBranchProtectionPayload()).toEqual({
      allow_deletions: false,
      allow_force_pushes: false,
      allow_fork_syncing: false,
      block_creations: false,
      enforce_admins: true,
      lock_branch: false,
      required_conversation_resolution: true,
      required_linear_history: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
        required_approving_review_count: 1
      },
      required_status_checks: {
        contexts: MAIN_BRANCH_REQUIRED_CHECKS,
        strict: true
      },
      restrictions: null
    });
  });

  it("can disable admin enforcement for personal repositories", (): void => {
    expect(
      buildMainBranchProtectionPayload({
        enforceAdmins: false
      }).enforce_admins
    ).toBe(false);
  });

  it("builds the strict release tag ruleset payload with GitHub Actions bypass", (): void => {
    expect(buildStrictReleaseTagRulesetPayload()).toEqual({
      bypass_actors: [
        {
          actor_id: GITHUB_ACTIONS_APP_ID,
          actor_type: "Integration",
          bypass_mode: "always"
        }
      ],
      conditions: {
        ref_name: {
          exclude: [],
          include: [RELEASE_TAG_PATTERN]
        }
      },
      enforcement: "active",
      name: RELEASE_TAG_RULESET_NAME,
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
      target: "tag"
    });
  });

  it("builds the personal repository fallback tag ruleset payload", (): void => {
    expect(buildPersonalRepoReleaseTagRulesetPayload()).toEqual({
      bypass_actors: [],
      conditions: {
        ref_name: {
          exclude: [],
          include: [RELEASE_TAG_PATTERN]
        }
      },
      enforcement: "active",
      name: RELEASE_TAG_RULESET_NAME,
      rules: [
        {
          type: "update",
          parameters: {
            update_allows_fetch_and_merge: false
          }
        },
        {
          type: "deletion"
        }
      ],
      target: "tag"
    });
  });

  it("rewrites 403 responses into administration guidance", (): void => {
    const error = normalizeGuardrailPermissionError(
      new Error(
        "GitHub API request failed (403) for Watout/BG3calculator/branches/main/protection. Resource not accessible by personal access token"
      ),
      "Watout/BG3calculator"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("repository Administration permission");
    expect(error.message).toContain("Administration: Read and write");
  });

  it("prints payloads in dry-run mode without calling fetch", async (): Promise<void> => {
    const commandRunner = async (
      command: string,
      args: string[]
    ): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
      const key = `${command} ${args.join(" ")}`;

      if (key === "git remote get-url origin") {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "https://github.com/Watout/BG3calculator.git\n"
        };
      }

      throw new Error(`Unexpected command: ${key}`);
    };

    const result = await applyGitHubRepoGuardrails({
      argv: ["--dry-run"],
      commandRunner,
      cwd: process.cwd(),
      env: {
        GITHUB_TOKEN_BG3CALCULATOR: "admin-token"
      },
      fetchImpl: async () => ({
        json: async () => ({
          owner: {
            type: "User"
          }
        }),
        ok: true
      })
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Repository: Watout/BG3calculator");
    expect(result.stdout).toContain("Branch protection payload:");
    expect(result.stdout).toContain(`"name": "${RELEASE_TAG_RULESET_NAME}"`);
    expect(result.stdout).toContain("Tag ruleset payload (personal-repo fallback):");
  });
});
