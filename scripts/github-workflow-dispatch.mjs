import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2026-03-10";
export const BRANCH_REF_PREFIX = "refs/heads/";
export const DEFAULT_TIMEOUT_MINUTES = 20;
export const DEFAULT_POLL_INTERVAL_MS = 10_000;

export class WorkflowDispatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkflowDispatchError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    autoCommit: false,
    commitMessage: null,
    cwd: null,
    dryRun: false,
    help: false,
    inputs: {},
    noPush: false,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    ref: null,
    repo: null,
    requireSuccess: false,
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    wait: false,
    workflow: null
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

    if (value === "--workflow") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --workflow.");
      }
      options.workflow = nextValue;
      index += 1;
      continue;
    }

    if (value === "--ref") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --ref.");
      }
      options.ref = normalizeRef(nextValue);
      index += 1;
      continue;
    }

    if (value === "--repo") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --repo.");
      }
      options.repo = nextValue;
      index += 1;
      continue;
    }

    if (value === "--input") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --input.");
      }
      const assignment = parseInputAssignment(nextValue);
      options.inputs[assignment.key] = assignment.value;
      index += 1;
      continue;
    }

    if (value === "--auto-commit") {
      options.autoCommit = true;
      continue;
    }

    if (value === "--no-push") {
      options.noPush = true;
      continue;
    }

    if (value === "--commit-message") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --commit-message.");
      }
      options.commitMessage = nextValue;
      index += 1;
      continue;
    }

    if (value === "--wait") {
      options.wait = true;
      continue;
    }

    if (value === "--require-success") {
      options.requireSuccess = true;
      options.wait = true;
      continue;
    }

    if (value === "--timeout-minutes") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --timeout-minutes.");
      }
      const timeoutMinutes = Number(nextValue);
      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        throw new WorkflowDispatchError("--timeout-minutes must be a positive number.");
      }
      options.timeoutMinutes = timeoutMinutes;
      index += 1;
      continue;
    }

    if (value === "--poll-interval-ms") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --poll-interval-ms.");
      }
      const pollIntervalMs = Number(nextValue);
      if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
        throw new WorkflowDispatchError("--poll-interval-ms must be a positive number.");
      }
      options.pollIntervalMs = pollIntervalMs;
      index += 1;
      continue;
    }

    if (value === "--cwd") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new WorkflowDispatchError("Missing value for --cwd.");
      }
      options.cwd = nextValue;
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    throw new WorkflowDispatchError(`Unknown argument: ${value}`);
  }

  return options;
}

export function parseInputAssignment(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw new WorkflowDispatchError(
      `Invalid workflow input "${value}". Expected key=value.`
    );
  }

  const key = value.slice(0, separatorIndex).trim();
  const assignedValue = value.slice(separatorIndex + 1);

  if (!key) {
    throw new WorkflowDispatchError(
      `Invalid workflow input "${value}". Expected key=value.`
    );
  }

  return {
    key,
    value: assignedValue
  };
}

export function normalizeRef(ref) {
  if (!ref) {
    throw new WorkflowDispatchError("Workflow ref cannot be empty.");
  }

  if (ref.startsWith("refs/tags/")) {
    throw new WorkflowDispatchError(
      "Only branch refs are supported for local workflow dispatch."
    );
  }

  return ref.startsWith(BRANCH_REF_PREFIX)
    ? ref.slice(BRANCH_REF_PREFIX.length)
    : ref;
}

export function printHelp() {
  return [
    "Usage: pnpm cicd:dispatch-workflow -- --workflow <file-or-id> [options]",
    "",
    "Options:",
    "  --workflow <value>         Workflow file name or workflow id. Required.",
    "  --ref <value>              Branch ref to push and dispatch against. Defaults to the current branch.",
    "  --input key=value          Workflow input. Repeat for multiple inputs.",
    "  --repo <owner/name>        Override GitHub repository slug.",
    "  --auto-commit             Stage and commit all current changes before pushing.",
    "  --no-push                 Require origin/<ref> to already match local HEAD and dispatch without pushing.",
    "  --commit-message <text>    Commit message used with --auto-commit.",
    "  --wait                     Poll until the workflow run finishes.",
    "  --require-success          Fail when the waited workflow run does not conclude successfully.",
    `  --timeout-minutes <n>      Wait timeout in minutes. Defaults to ${DEFAULT_TIMEOUT_MINUTES}.`,
    `  --poll-interval-ms <n>     Poll interval while waiting. Defaults to ${DEFAULT_POLL_INTERVAL_MS}.`,
    "  --cwd <path>               Working directory used to resolve git origin when --repo is omitted.",
    "  --dry-run                  Validate local state and print the dispatch payload without pushing or dispatching.",
    "  --help, -h                 Show this help text.",
    "",
    "Required environment variables:",
    "  GH_TOKEN or GITHUB_TOKEN   Generic GitHub token with workflow dispatch/read permissions.",
    "                             Repository-scoped fallbacks are also supported,",
    "                             for example GITHUB_TOKEN_BG3CALCULATOR."
  ].join("\n");
}

export function parseGitHubRepository(remoteUrl) {
  const httpsMatch =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshProtocolMatch =
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshProtocolMatch) {
    return `${sshProtocolMatch[1]}/${sshProtocolMatch[2]}`;
  }

  throw new WorkflowDispatchError(
    `Unsupported origin remote: ${remoteUrl}. Pass --repo owner/name if needed.`
  );
}

export function resolveRepositorySlug({ override, remoteUrl, env = process.env }) {
  const candidate = override ?? env.GITHUB_REPOSITORY ?? env.BG3DC_GITHUB_REPOSITORY ?? null;
  if (candidate) {
    if (!/^[^/\s]+\/[^/\s]+$/u.test(candidate)) {
      throw new WorkflowDispatchError(
        `Invalid GitHub repository override "${candidate}". Expected owner/name.`
      );
    }
    return candidate;
  }

  if (!remoteUrl) {
    throw new WorkflowDispatchError(
      "Unable to resolve the GitHub repository slug from git origin. Pass --repo owner/name."
    );
  }

  return parseGitHubRepository(remoteUrl);
}

export function normalizeGitHubTokenEnvSuffix(value) {
  return value.replace(/[^A-Za-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").toUpperCase();
}

export function buildRepositoryScopedTokenEnvNames(repositorySlug) {
  if (!repositorySlug) {
    return [];
  }

  const [owner = "", repo = ""] = repositorySlug.split("/");
  const repoSuffix = normalizeGitHubTokenEnvSuffix(repo);
  const ownerSuffix = normalizeGitHubTokenEnvSuffix(owner);
  const candidateSuffixes = [];

  if (repoSuffix) {
    candidateSuffixes.push(repoSuffix);
  }

  if (ownerSuffix && repoSuffix) {
    candidateSuffixes.push(`${ownerSuffix}_${repoSuffix}`);
  }

  const envNames = new Set();
  for (const suffix of candidateSuffixes) {
    envNames.add(`GH_TOKEN_${suffix}`);
    envNames.add(`GITHUB_TOKEN_${suffix}`);
  }

  return [...envNames];
}

export function formatGitHubTokenRequirement({
  action = "dispatching workflows",
  repositorySlug = null
} = {}) {
  const scopedEnvNames = buildRepositoryScopedTokenEnvNames(repositorySlug);

  if (scopedEnvNames.length === 0) {
    return `Set GH_TOKEN or GITHUB_TOKEN before ${action}.`;
  }

  return `Set GH_TOKEN or GITHUB_TOKEN before ${action}, or set a repository-scoped token: ${scopedEnvNames.join(", ")}.`;
}

export function getGitHubToken(env = process.env, { repositorySlug = null } = {}) {
  const genericToken = env.GH_TOKEN ?? env.GITHUB_TOKEN ?? null;
  if (genericToken) {
    return genericToken;
  }

  const scopedEnvNames = buildRepositoryScopedTokenEnvNames(repositorySlug);
  for (const envName of scopedEnvNames) {
    if (env[envName]) {
      return env[envName];
    }
  }

  return null;
}

export function validateExecutionContext({
  autoCommit,
  localBranch,
  noPush,
  ref,
  repositorySlug,
  token,
  workingTreeStatus
}) {
  const errors = [];

  if (!token) {
    errors.push(formatGitHubTokenRequirement({
      action: "dispatching workflows",
      repositorySlug
    }));
  }

  if (!repositorySlug) {
    errors.push("Unable to resolve the GitHub repository slug from git origin or --repo.");
  }

  if (!localBranch || localBranch === "HEAD") {
    errors.push("Check out a branch before dispatching workflows from local.");
  }

  if (!ref) {
    errors.push("A branch ref is required.");
  }

  if (localBranch && ref && localBranch !== ref) {
    errors.push(
      `Check out branch "${ref}" locally before dispatching from it. Current branch: ${localBranch}.`
    );
  }

  if (noPush && autoCommit) {
    errors.push("Auto-commit cannot be used together with --no-push.");
  }

  if (!autoCommit && workingTreeStatus.trim().length > 0) {
    errors.push("Commit or stash local changes before dispatching a workflow.");
  }

  return errors;
}

export function buildGitHubUrl(pathname, searchParams) {
  const url = new URL(pathname, GITHUB_API_BASE_URL);
  if (searchParams) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });
    url.search = params.toString();
  }
  return url;
}

export function buildGitHubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "codex-github-workflow-dispatch",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  };
}

export function createGitHubClient({ fetchImpl, token, repositorySlug }) {
  return {
    async requestJson({ method = "GET", pathname, searchParams, body }) {
      const response = await fetchImpl(buildGitHubUrl(pathname, searchParams), {
        body: body ? JSON.stringify(body) : undefined,
        headers: buildGitHubHeaders(token),
        method
      });

      if (!response.ok) {
        throw await toGitHubError(response, repositorySlug, pathname);
      }

      if (response.status === 204) {
        return {};
      }

      return response.json();
    }
  };
}

async function toGitHubError(response, repositorySlug, pathname) {
  let details = "";
  try {
    const payload = await response.json();
    details = payload.message ? ` ${payload.message}` : "";
  } catch {
    details = "";
  }

  return new WorkflowDispatchError(
    `GitHub API request failed (${response.status}) for ${repositorySlug}${pathname}.${details}`.trim()
  );
}

export function selectWorkflowRun(
  runs,
  {
    createdAfterMs,
    event = "workflow_dispatch",
    headSha = null,
    ref = null
  }
) {
  return (
    [...runs]
      .filter((run) => {
        if (run.event !== event) {
          return false;
        }

        if (headSha && run.head_sha !== headSha) {
          return false;
        }

        if (ref && run.head_branch && run.head_branch !== ref) {
          return false;
        }

        const createdAt = Date.parse(run.created_at);
        return Number.isFinite(createdAt) && createdAt >= createdAfterMs - DEFAULT_POLL_INTERVAL_MS;
      })
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null
  );
}

export function getRunFailureMessage(run) {
  if (run.status !== "completed") {
    return null;
  }

  if (run.conclusion === "success") {
    return null;
  }

  const runUrl = run.html_url ? ` See ${run.html_url}.` : "";
  return `Workflow finished with conclusion "${run.conclusion ?? "unknown"}".${runUrl}`;
}

export async function waitForWorkflowRun({
  findRun,
  getRun,
  timeoutMs,
  now = () => Date.now(),
  sleep = defaultSleep,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}) {
  const deadline = now() + timeoutMs;
  let workflowRun = null;

  while (!workflowRun) {
    if (now() >= deadline) {
      throw new WorkflowDispatchError(
        "Timed out while waiting for the GitHub Actions run to appear."
      );
    }

    workflowRun = await findRun();
    if (!workflowRun) {
      await sleep(pollIntervalMs);
    }
  }

  while (workflowRun.status !== "completed") {
    if (now() >= deadline) {
      throw new WorkflowDispatchError(
        `Timed out while waiting for the workflow to complete. See ${workflowRun.html_url}.`
      );
    }

    await sleep(pollIntervalMs);
    workflowRun = await getRun(workflowRun.id);
  }

  return workflowRun;
}

export async function runCommand(command, args, { cwd, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const result = {
        exitCode: code ?? 1,
        stderr,
        stdout
      };

      if (code === 0 || allowFailure) {
        resolve(result);
        return;
      }

      reject(
        new WorkflowDispatchError(
          `Command failed (${command} ${args.join(" ")}): ${stderr.trim() || stdout.trim()}`
        )
      );
    });
  });
}

export async function gitStdout(commandRunner, args, options) {
  const result = await commandRunner("git", args, options);
  return result.stdout.trim();
}

export async function resolveRemoteHeadSha(commandRunner, { cwd, ref, remote = "origin" }) {
  const result = await commandRunner(
    "git",
    ["ls-remote", "--exit-code", remote, `${BRANCH_REF_PREFIX}${ref}`],
    { allowFailure: true, cwd }
  );

  if (result.exitCode !== 0) {
    throw new WorkflowDispatchError(
      `Unable to resolve ${remote}/${ref}. Push the branch first.`
    );
  }

  const [sha] = result.stdout.trim().split(/\s+/u);
  if (!sha) {
    throw new WorkflowDispatchError(
      `Unable to resolve ${remote}/${ref}. Push the branch first.`
    );
  }

  return sha;
}

export async function commitAllChangesIfNeeded({
  autoCommit,
  commandRunner,
  commitMessage,
  cwd,
  workingTreeStatus
}) {
  if (!autoCommit || workingTreeStatus.trim().length === 0) {
    return false;
  }

  await commandRunner("git", ["add", "-A"], { cwd });
  await commandRunner("git", ["commit", "-m", commitMessage], { cwd });
  return true;
}

export function defaultSleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export async function runGitHubWorkflowDispatch({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleep = defaultSleep,
  commandRunner = runCommand
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.workflow) {
    throw new WorkflowDispatchError("Missing required --workflow argument.");
  }

  if (typeof fetchImpl !== "function") {
    throw new WorkflowDispatchError("Global fetch is unavailable in this Node.js runtime.");
  }

  const resolvedCwd = options.cwd ?? cwd;
  const remoteUrlResult = await commandRunner(
    "git",
    ["remote", "get-url", "origin"],
    { allowFailure: true, cwd: resolvedCwd }
  );
  const remoteUrl = remoteUrlResult.exitCode === 0 ? remoteUrlResult.stdout.trim() : null;
  const repositorySlug = resolveRepositorySlug({
    env,
    override: options.repo,
    remoteUrl
  });
  const token = getGitHubToken(env, { repositorySlug });
  const localBranch = await gitStdout(
    commandRunner,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: resolvedCwd }
  );
  const ref = options.ref ?? localBranch;
  const workingTreeStatus = await gitStdout(commandRunner, ["status", "--short"], {
    cwd: resolvedCwd
  });
  const validationErrors = validateExecutionContext({
    autoCommit: options.autoCommit,
    localBranch,
    noPush: options.noPush,
    ref,
    repositorySlug,
    token,
    workingTreeStatus
  });

  if (validationErrors.length > 0) {
    throw new WorkflowDispatchError(validationErrors.join("\n"));
  }

  const commitMessage =
    options.commitMessage ??
    `chore: local cicd handoff for ${options.workflow.replace(/\.[^.]+$/u, "")}`;
  const committed = await commitAllChangesIfNeeded({
    autoCommit: options.autoCommit,
    commandRunner,
    commitMessage,
    cwd: resolvedCwd,
    workingTreeStatus
  });
  const localHeadSha = await gitStdout(commandRunner, ["rev-parse", "HEAD"], {
    cwd: resolvedCwd
  });
  const dispatchPayload = {
    inputs: options.inputs,
    ref
  };
  const summaryLines = [
    `Repository: ${repositorySlug}`,
    `Workflow: ${options.workflow}`,
    `Ref: ${ref}`,
    `Head SHA: ${localHeadSha}`,
    `Push before dispatch: ${options.noPush ? "disabled" : "enabled"}`,
    `Auto commit: ${committed ? "yes" : options.autoCommit ? "no changes" : "disabled"}`
  ];

  let remoteHeadSha = null;
  if (options.noPush) {
    remoteHeadSha = await resolveRemoteHeadSha(commandRunner, {
      cwd: resolvedCwd,
      ref
    });

    if (remoteHeadSha !== localHeadSha) {
      throw new WorkflowDispatchError(
        `Push branch "${ref}" so origin matches local HEAD ${localHeadSha.slice(0, 7)} before dispatching.`
      );
    }

    summaryLines.push(`Remote HEAD SHA: ${remoteHeadSha}`);
  }

  if (Object.keys(options.inputs).length > 0) {
    summaryLines.push(`Inputs: ${JSON.stringify(options.inputs)}`);
  }

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: `${summaryLines.join("\n")}\n\nDispatch payload:\n${JSON.stringify(dispatchPayload, null, 2)}\n`
    };
  }

  if (!options.noPush) {
    await commandRunner("git", ["push", "origin", `HEAD:${BRANCH_REF_PREFIX}${ref}`], {
      cwd: resolvedCwd
    });
    remoteHeadSha = await resolveRemoteHeadSha(commandRunner, {
      cwd: resolvedCwd,
      ref
    });
    if (remoteHeadSha !== localHeadSha) {
      throw new WorkflowDispatchError(
        `Push branch "${ref}" so origin matches local HEAD ${localHeadSha.slice(0, 7)} before dispatching.`
      );
    }
  }

  const client = createGitHubClient({
    fetchImpl,
    repositorySlug,
    token
  });
  const dispatchStartedAt = now();

  await client.requestJson({
    body: dispatchPayload,
    method: "POST",
    pathname: `/repos/${repositorySlug}/actions/workflows/${encodeURIComponent(options.workflow)}/dispatches`
  });

  if (!options.wait) {
    return {
      exitCode: 0,
      stdout: `${summaryLines.join("\n")}\nDispatch accepted.\n`
    };
  }

  const workflowRun = await waitForWorkflowRun({
    findRun: async () => {
      const result = await client.requestJson({
        pathname: `/repos/${repositorySlug}/actions/workflows/${encodeURIComponent(options.workflow)}/runs`,
        searchParams: {
          branch: ref,
          created: `>=${new Date(dispatchStartedAt - DEFAULT_POLL_INTERVAL_MS).toISOString()}`,
          event: "workflow_dispatch",
          head_sha: remoteHeadSha,
          per_page: "20"
        }
      });

      return selectWorkflowRun(result.workflow_runs ?? [], {
        createdAfterMs: dispatchStartedAt,
        headSha: remoteHeadSha,
        ref
      });
    },
    getRun: async (runId) =>
      client.requestJson({
        pathname: `/repos/${repositorySlug}/actions/runs/${runId}`
      }),
    now,
    pollIntervalMs: options.pollIntervalMs,
    sleep,
    timeoutMs: options.timeoutMinutes * 60_000
  });
  const failureMessage = getRunFailureMessage(workflowRun);
  if (options.requireSuccess && failureMessage) {
    throw new WorkflowDispatchError(failureMessage);
  }

  summaryLines.push(`Run URL: ${workflowRun.html_url}`);
  summaryLines.push(`Run Conclusion: ${workflowRun.conclusion ?? workflowRun.status}`);

  return {
    exitCode: 0,
    stdout: `${summaryLines.join("\n")}\n`
  };
}

async function main() {
  try {
    const result = await runGitHubWorkflowDispatch();
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
