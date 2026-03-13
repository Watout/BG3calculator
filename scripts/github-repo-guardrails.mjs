import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildRepositoryScopedTokenEnvNames,
  createGitHubClient,
  getGitHubToken,
  parseGitHubRepository,
  runCommand
} from "./github-workflow-dispatch.mjs";

export const MAIN_BRANCH = "main";
export const MAIN_BRANCH_REQUIRED_CHECKS = ["lint-typecheck-test", "automation-guardrails"];
export const RELEASE_TAG_RULESET_NAME = "Protect release tags";
export const RELEASE_TAG_PATTERN = "refs/tags/*.*.*";
export const GITHUB_ACTIONS_APP_ID = 15368;

export class GitHubRepoGuardrailsError extends Error {
  constructor(message) {
    super(message);
    this.name = "GitHubRepoGuardrailsError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    cwd: null,
    dryRun: false,
    help: false,
    repo: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--") {
      continue;
    }

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--repo") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new GitHubRepoGuardrailsError("Missing value for --repo.");
      }
      options.repo = nextValue;
      index += 1;
      continue;
    }

    if (value === "--cwd") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new GitHubRepoGuardrailsError("Missing value for --cwd.");
      }
      options.cwd = nextValue;
      index += 1;
      continue;
    }

    throw new GitHubRepoGuardrailsError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm cicd:apply-github-guardrails [options]",
    "",
    "Options:",
    "  --repo <owner/name>        Override GitHub repository slug.",
    "  --cwd <path>               Working directory used to resolve git origin when --repo is omitted.",
    "  --dry-run                  Print the desired GitHub protection payloads without calling the API.",
    "  --help, -h                 Show this help text.",
    "",
    "Required environment variables:",
    "  GH_ADMIN_TOKEN or GITHUB_ADMIN_TOKEN",
    "                             Preferred GitHub token with repository Administration permission.",
    "                             Repository-scoped admin token fallbacks are also supported,",
    "                             for example GITHUB_ADMIN_TOKEN_BG3CALCULATOR.",
    "  GH_TOKEN or GITHUB_TOKEN   Accepted as a fallback, but they still must include repository Administration permission."
  ].join("\n");
}

export function buildAdministrationTokenEnvNames(repositorySlug) {
  const genericNames = ["GH_ADMIN_TOKEN", "GITHUB_ADMIN_TOKEN"];
  const scopedNames = buildRepositoryScopedTokenEnvNames(repositorySlug).flatMap((envName) => {
    if (envName.startsWith("GH_TOKEN_")) {
      return [`GH_ADMIN_TOKEN_${envName.slice("GH_TOKEN_".length)}`];
    }

    if (envName.startsWith("GITHUB_TOKEN_")) {
      return [`GITHUB_ADMIN_TOKEN_${envName.slice("GITHUB_TOKEN_".length)}`];
    }

    return [];
  });

  return [...genericNames, ...scopedNames];
}

export function formatAdministrationTokenRequirement({ repositorySlug = null } = {}) {
  const names = buildAdministrationTokenEnvNames(repositorySlug);
  return `Set ${names.join(", ")} before applying GitHub repository guardrails.`;
}

export function getGitHubAdministrationToken(env = process.env, { repositorySlug = null } = {}) {
  for (const envName of buildAdministrationTokenEnvNames(repositorySlug)) {
    if (env[envName]) {
      return {
        source: envName,
        token: env[envName]
      };
    }
  }

  const fallbackToken = getGitHubToken(env, { repositorySlug });
  if (!fallbackToken) {
    return null;
  }

  return {
    source: "generic-token",
    token: fallbackToken
  };
}

export function buildMainBranchProtectionPayload() {
  return {
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
      contexts: [...MAIN_BRANCH_REQUIRED_CHECKS],
      strict: true
    },
    restrictions: null
  };
}

export function buildStrictReleaseTagRulesetPayload() {
  return {
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
    rules: [
      {
        type: "creation"
      },
      {
        type: "update"
      },
      {
        type: "deletion"
      }
    ],
    target: "tag"
  };
}

export function buildPersonalRepoReleaseTagRulesetPayload() {
  return {
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
  };
}

export function resolveRepositorySlugFromRemote({ override = null, remoteUrl = null }) {
  if (override) {
    return override;
  }

  if (!remoteUrl) {
    throw new GitHubRepoGuardrailsError(
      "Unable to resolve the GitHub repository slug from git origin. Pass --repo owner/name."
    );
  }

  return parseGitHubRepository(remoteUrl);
}

export function normalizeGuardrailPermissionError(error, repositorySlug) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/GitHub API request failed \(403\)/u.test(message)) {
    return error;
  }

  return new GitHubRepoGuardrailsError(
    [
      `GitHub repository guardrails require repository Administration permission on ${repositorySlug}.`,
      "The current token can dispatch workflows, but it cannot update branch protection or repository rulesets.",
      formatAdministrationTokenRequirement({ repositorySlug }),
      "For a fine-grained personal access token, grant Repository permissions -> Administration: Read and write."
    ].join("\n")
  );
}

export async function listRepositoryRulesets(client, repositorySlug) {
  const response = await client.requestJson({
    pathname: `/repos/${repositorySlug}/rulesets`
  });

  return Array.isArray(response) ? response : [];
}

export async function getRepositoryMetadata(client, repositorySlug) {
  return client.requestJson({
    pathname: `/repos/${repositorySlug}`
  });
}

export async function ensureReleaseTagRuleset(client, repositorySlug) {
  const repository = await getRepositoryMetadata(client, repositorySlug);
  const ownerType = repository?.owner?.type ?? null;
  const compatibilityMode = ownerType === "User" ? "personal-repo-fallback" : "strict";
  const payload =
    compatibilityMode === "strict"
      ? buildStrictReleaseTagRulesetPayload()
      : buildPersonalRepoReleaseTagRulesetPayload();
  const rulesets = await listRepositoryRulesets(client, repositorySlug);
  const existing = rulesets.find(
    (ruleset) =>
      ruleset.name === RELEASE_TAG_RULESET_NAME && ruleset.target === payload.target
  );

  if (existing) {
    const updated = await client.requestJson({
      body: payload,
      method: "PUT",
      pathname: `/repos/${repositorySlug}/rulesets/${existing.id}`
    });

    return {
      action: "updated",
      compatibilityMode,
      id: existing.id,
      response: updated
    };
  }

  const created = await client.requestJson({
    body: payload,
    method: "POST",
    pathname: `/repos/${repositorySlug}/rulesets`
  });

  return {
    action: "created",
    compatibilityMode,
    id: created.id ?? null,
    response: created
  };
}

export async function applyGitHubRepoGuardrails({
  argv = process.argv.slice(2),
  commandRunner = runCommand,
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return {
      exitCode: 0,
      stdout: `${printHelp()}\n`
    };
  }

  if (typeof fetchImpl !== "function") {
    throw new GitHubRepoGuardrailsError("Global fetch is unavailable in this Node.js runtime.");
  }

  const resolvedCwd = options.cwd ?? cwd;
  const remoteUrlResult = await commandRunner("git", ["remote", "get-url", "origin"], {
    allowFailure: true,
    cwd: resolvedCwd
  });
  const remoteUrl = remoteUrlResult.exitCode === 0 ? remoteUrlResult.stdout.trim() : null;
  const repositorySlug = resolveRepositorySlugFromRemote({
    override: options.repo ?? env.GITHUB_REPOSITORY ?? env.BG3DC_GITHUB_REPOSITORY ?? null,
    remoteUrl
  });
  const tokenInfo = getGitHubAdministrationToken(env, { repositorySlug });

  if (!tokenInfo) {
    throw new GitHubRepoGuardrailsError(
      formatAdministrationTokenRequirement({ repositorySlug })
    );
  }

  const branchProtectionPayload = buildMainBranchProtectionPayload();
  const strictTagRulesetPayload = buildStrictReleaseTagRulesetPayload();
  const personalRepoTagRulesetPayload = buildPersonalRepoReleaseTagRulesetPayload();

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout:
        [
          `Repository: ${repositorySlug}`,
          `Token source: ${tokenInfo.source}`,
          `Main branch: ${MAIN_BRANCH}`,
          `Release tag pattern: ${RELEASE_TAG_PATTERN}`,
          "",
          "Branch protection payload:",
          JSON.stringify(branchProtectionPayload, null, 2),
          "",
          "Tag ruleset payload (strict / org-capable):",
          JSON.stringify(strictTagRulesetPayload, null, 2),
          "",
          "Tag ruleset payload (personal-repo fallback):",
          JSON.stringify(personalRepoTagRulesetPayload, null, 2)
        ].join("\n") + "\n"
    };
  }

  const client = createGitHubClient({
    fetchImpl,
    repositorySlug,
    token: tokenInfo.token
  });

  try {
    await client.requestJson({
      body: branchProtectionPayload,
      method: "PUT",
      pathname: `/repos/${repositorySlug}/branches/${encodeURIComponent(MAIN_BRANCH)}/protection`
    });

    const tagRulesetResult = await ensureReleaseTagRuleset(client, repositorySlug);

    return {
      exitCode: 0,
      stdout:
        [
          `Repository: ${repositorySlug}`,
          `Main branch protection: updated (${MAIN_BRANCH_REQUIRED_CHECKS.join(", ")})`,
          `Release tag ruleset: ${tagRulesetResult.action} (${RELEASE_TAG_RULESET_NAME})`,
          `Release tag ruleset mode: ${tagRulesetResult.compatibilityMode}`,
          tagRulesetResult.compatibilityMode === "strict"
            ? `Release tag bypass actor: github-actions app ${GITHUB_ACTIONS_APP_ID}`
            : "Release tag compatibility note: personal repositories cannot grant github-actions integration bypass, so tag updates/deletions are blocked while new tag creation stays available for release automation.",
          `Protected tag pattern: ${RELEASE_TAG_PATTERN}`
        ].join("\n") + "\n"
    };
  } catch (error) {
    throw normalizeGuardrailPermissionError(error, repositorySlug);
  }
}

async function main() {
  try {
    const result = await applyGitHubRepoGuardrails();
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
