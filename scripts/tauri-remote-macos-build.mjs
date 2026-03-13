import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  formatGitHubTokenRequirement,
  getGitHubToken
} from "./github-workflow-dispatch.mjs";

export const WORKFLOW_FILE = "desktop-build.yml";
export const TARGET_NAME = "macos-universal";
export const ARTIFACT_NAME = "bg3calculator-macos-universal";
export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2026-03-10";
export const POLL_INTERVAL_MS = 10_000;
export const ARTIFACT_POLL_INTERVAL_MS = 5_000;
export const ARTIFACT_WAIT_MS = 30_000;
export const DEFAULT_TIMEOUT_MINUTES = 25;
export const BRANCH_REF_PREFIX = "refs/heads/";

export class RemoteBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = "RemoteBuildError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    dryRun: false,
    outDir: null,
    ref: null,
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--ref") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new RemoteBuildError("Missing value for --ref.");
      }
      options.ref = normalizeBranchRef(nextValue);
      index += 1;
      continue;
    }

    if (value === "--out-dir") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new RemoteBuildError("Missing value for --out-dir.");
      }
      options.outDir = nextValue;
      index += 1;
      continue;
    }

    if (value === "--timeout-minutes") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new RemoteBuildError("Missing value for --timeout-minutes.");
      }
      const timeoutMinutes = Number(nextValue);
      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        throw new RemoteBuildError("--timeout-minutes must be a positive number.");
      }
      options.timeoutMinutes = timeoutMinutes;
      index += 1;
      continue;
    }

    throw new RemoteBuildError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm tauri:build:macos:remote -- [options]",
    "",
    "Options:",
    "  --ref <branch>             Remote branch to build. Defaults to the current branch.",
    "  --out-dir <path>           Directory for the downloaded artifact contents.",
    `  --timeout-minutes <n>      Total wait timeout in minutes. Defaults to ${DEFAULT_TIMEOUT_MINUTES}.`,
    "  --dry-run                  Validate local prerequisites and print the workflow request without dispatching it.",
    "  --help, -h                 Show this help text.",
    "",
    "Required environment variables:",
    "  GH_TOKEN or GITHUB_TOKEN   Generic GitHub token that can dispatch workflows and read artifacts.",
    "                             Repository-scoped fallbacks are also supported,",
    "                             for example GITHUB_TOKEN_BG3CALCULATOR.",
    "",
    "Optional environment variables:",
    "  BG3DC_GITHUB_REPOSITORY    Override the GitHub repository slug (owner/repo).",
    "  GITHUB_REPOSITORY          Fallback repository slug when running outside GitHub Actions."
  ].join("\n");
}

export function normalizeBranchRef(ref) {
  if (!ref) {
    throw new RemoteBuildError("Branch ref cannot be empty.");
  }

  if (ref.startsWith("refs/tags/")) {
    throw new RemoteBuildError("Only remote branches are supported for remote macOS builds.");
  }

  return ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : ref;
}

export function parseGitHubRepository(remoteUrl) {
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshProtocolMatch = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshProtocolMatch) {
    return `${sshProtocolMatch[1]}/${sshProtocolMatch[2]}`;
  }

  throw new RemoteBuildError(
    `Unsupported origin remote: ${remoteUrl}. Set BG3DC_GITHUB_REPOSITORY to owner/repo if needed.`
  );
}

export function resolveRepositorySlug({ override, remoteUrl }) {
  if (override) {
    if (!/^[^/\s]+\/[^/\s]+$/u.test(override)) {
      throw new RemoteBuildError(
        `Invalid GitHub repository override "${override}". Expected owner/repo.`
      );
    }
    return override;
  }

  return parseGitHubRepository(remoteUrl);
}

export function buildDispatchPayload({ ref, requestId, target = TARGET_NAME }) {
  return {
    ref,
    inputs: {
      request_id: requestId,
      target
    }
  };
}

export function buildDefaultOutputDirectory({ cwd, requestId }) {
  return path.join(cwd, ".artifacts", TARGET_NAME, requestId);
}

export function validateExecutionContext({
  token,
  workingTreeStatus,
  localBranch,
  ref,
  localHeadSha,
  remoteHeadSha,
  repositorySlug
}) {
  const errors = [];

  if (!token) {
    errors.push(formatGitHubTokenRequirement({
      action: "running the remote macOS build",
      repositorySlug
    }));
  }

  if (!repositorySlug) {
    errors.push("Unable to resolve the GitHub repository slug from origin or environment.");
  }

  if (!localBranch || localBranch === "HEAD") {
    errors.push("Check out a branch before running the remote macOS build.");
  }

  if (!ref) {
    errors.push("A remote branch ref is required.");
  }

  if (workingTreeStatus.trim().length > 0) {
    errors.push("Commit or stash local changes before dispatching a remote macOS build.");
  }

  if (localHeadSha && remoteHeadSha && localHeadSha !== remoteHeadSha) {
    errors.push(
      `Push branch "${ref}" so origin matches local HEAD ${localHeadSha.slice(0, 7)} before dispatching.`
    );
  }

  return errors;
}

export function selectWorkflowRun(runs, { headSha, ref, createdAfterMs }) {
  return [...runs]
    .filter((run) => {
      if (run.event !== "workflow_dispatch") {
        return false;
      }
      if (run.head_sha !== headSha || run.head_branch !== ref) {
        return false;
      }
      const createdAt = Date.parse(run.created_at);
      return Number.isFinite(createdAt) && createdAt >= createdAfterMs - POLL_INTERVAL_MS;
    })
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
}

export function getRunFailureMessage(run) {
  if (run.status !== "completed") {
    return null;
  }

  if (run.conclusion === "success") {
    return null;
  }

  const runUrl = run.html_url ? ` See ${run.html_url}.` : "";
  return `Remote macOS build finished with conclusion "${run.conclusion ?? "unknown"}".${runUrl}`;
}

export function selectArtifact(artifacts, artifactName = ARTIFACT_NAME) {
  return [...artifacts]
    .filter((artifact) => artifact.name === artifactName && !artifact.expired)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
}

export async function waitForWorkflowRun({
  findRun,
  getRun,
  timeoutMs,
  now = () => Date.now(),
  sleep = defaultSleep,
  pollIntervalMs = POLL_INTERVAL_MS
}) {
  const deadline = now() + timeoutMs;
  let workflowRun = null;

  while (!workflowRun) {
    if (now() >= deadline) {
      throw new RemoteBuildError("Timed out while waiting for the GitHub Actions run to appear.");
    }

    workflowRun = await findRun();
    if (!workflowRun) {
      await sleep(pollIntervalMs);
    }
  }

  while (workflowRun.status !== "completed") {
    if (now() >= deadline) {
      throw new RemoteBuildError(
        `Timed out while waiting for the remote build to complete. See ${workflowRun.html_url}.`
      );
    }

    await sleep(pollIntervalMs);
    workflowRun = await getRun(workflowRun.id);
  }

  const failureMessage = getRunFailureMessage(workflowRun);
  if (failureMessage) {
    throw new RemoteBuildError(failureMessage);
  }

  return workflowRun;
}

export async function waitForArtifact({
  listArtifacts,
  timeoutMs = ARTIFACT_WAIT_MS,
  now = () => Date.now(),
  sleep = defaultSleep,
  pollIntervalMs = ARTIFACT_POLL_INTERVAL_MS,
  artifactName = ARTIFACT_NAME
}) {
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const artifacts = await listArtifacts();
    const artifact = selectArtifact(artifacts, artifactName);
    if (artifact) {
      return artifact;
    }
    await sleep(pollIntervalMs);
  }

  throw new RemoteBuildError(
    `Timed out while waiting for artifact "${artifactName}" to become available.`
  );
}

export async function ensureOutputDirectoryReady(outputDirectory) {
  try {
    await access(outputDirectory);
  } catch {
    return;
  }

  const existingEntries = await readdir(outputDirectory);
  if (existingEntries.length > 0) {
    throw new RemoteBuildError(
      `Output directory "${outputDirectory}" already exists and is not empty.`
    );
  }
}

export function createRequestId({ headSha, now = new Date() }) {
  const timestamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `remote-macos-${timestamp}-${headSha.slice(0, 7)}-${randomUUID().slice(0, 8)}`;
}

export async function runRemoteMacosBuild({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = defaultSleep,
  commandRunner = runCommand
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  const localBranch = normalizeBranchRef(
    await gitStdout(commandRunner, ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })
  );
  const ref = normalizeBranchRef(options.ref ?? localBranch);
  const localHeadSha = await gitStdout(commandRunner, ["rev-parse", "HEAD"], { cwd });
  const workingTreeStatus = await gitStdout(commandRunner, ["status", "--porcelain"], { cwd });
  const originRemoteUrl = await gitStdout(commandRunner, ["remote", "get-url", "origin"], {
    cwd
  });
  const repositorySlug = resolveRepositorySlug({
    override: env.BG3DC_GITHUB_REPOSITORY ?? env.GITHUB_REPOSITORY ?? null,
    remoteUrl: originRemoteUrl
  });
  const token = getGitHubToken(env, { repositorySlug });
  const localValidationErrors = validateExecutionContext({
    token,
    workingTreeStatus,
    localBranch,
    ref,
    localHeadSha,
    remoteHeadSha: null,
    repositorySlug
  });

  if (localValidationErrors.length > 0) {
    throw new RemoteBuildError(localValidationErrors.join("\n"));
  }

  const remoteHeadSha = await resolveRemoteHeadSha(commandRunner, ref, cwd);
  if (localHeadSha !== remoteHeadSha) {
    throw new RemoteBuildError(
      `Push branch "${ref}" so origin matches local HEAD ${localHeadSha.slice(0, 7)} before dispatching.`
    );
  }

  const requestId = createRequestId({
    headSha: localHeadSha,
    now: new Date(now())
  });
  const outputDirectory = path.resolve(
    cwd,
    options.outDir ?? buildDefaultOutputDirectory({ cwd, requestId })
  );
  await ensureOutputDirectoryReady(outputDirectory);

  const dispatchPayload = buildDispatchPayload({
    ref,
    requestId
  });

  const summary = [
    `Repository: ${repositorySlug}`,
    `Workflow: ${WORKFLOW_FILE}`,
    `Branch: ${ref}`,
    `Head SHA: ${localHeadSha}`,
    `Target: ${TARGET_NAME}`,
    `Request ID: ${requestId}`,
    `Artifact: ${ARTIFACT_NAME}`,
    `Output directory: ${outputDirectory}`
  ].join("\n");

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: `${summary}\n\nDispatch payload:\n${JSON.stringify(dispatchPayload, null, 2)}\n`
    };
  }

  const github = createGitHubClient({
    fetchImpl,
    token,
    repositorySlug
  });
  const dispatchStartedAt = now();

  await github.requestJson({
    method: "POST",
    pathname: `/repos/${repositorySlug}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    body: dispatchPayload
  });

  const workflowRun = await waitForWorkflowRun({
    timeoutMs: options.timeoutMinutes * 60_000,
    now,
    sleep,
    findRun: async () => {
      const result = await github.requestJson({
        pathname: `/repos/${repositorySlug}/actions/workflows/${WORKFLOW_FILE}/runs`,
        searchParams: {
          branch: ref,
          event: "workflow_dispatch",
          head_sha: localHeadSha,
          per_page: "10",
          created: `>=${new Date(dispatchStartedAt - POLL_INTERVAL_MS).toISOString()}`
        }
      });
      return selectWorkflowRun(result.workflow_runs ?? [], {
        headSha: localHeadSha,
        ref,
        createdAfterMs: dispatchStartedAt
      });
    },
    getRun: async (runId) =>
      github.requestJson({
        pathname: `/repos/${repositorySlug}/actions/runs/${runId}`
      })
  });

  const artifact = await waitForArtifact({
    now,
    sleep,
    listArtifacts: async () => {
      const result = await github.requestJson({
        pathname: `/repos/${repositorySlug}/actions/runs/${workflowRun.id}/artifacts`
      });
      return result.artifacts ?? [];
    }
  });

  await mkdir(outputDirectory, { recursive: true });
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "bg3dc-remote-macos-"));
  const archivePath = path.join(tempDirectory, `${ARTIFACT_NAME}.zip`);

  try {
    await github.downloadToFile({
      pathname: `/repos/${repositorySlug}/actions/artifacts/${artifact.id}/zip`,
      filePath: archivePath
    });
    await extractZipArchive({
      archivePath,
      destinationPath: outputDirectory,
      commandRunner
    });
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }

  return {
    exitCode: 0,
    stdout: `${summary}\nRun URL: ${workflowRun.html_url}\nDownloaded to: ${outputDirectory}\n`
  };
}

export function createGitHubClient({ fetchImpl, token, repositorySlug }) {
  return {
    async requestJson({ method = "GET", pathname, searchParams, body }) {
      const response = await fetchImpl(buildGitHubUrl(pathname, searchParams), {
        method,
        headers: buildGitHubHeaders(token),
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        throw await toGitHubError(response, repositorySlug, pathname);
      }

      if (response.status === 204) {
        return {};
      }

      return response.json();
    },

    async downloadToFile({ pathname, filePath }) {
      const response = await fetchImpl(buildGitHubUrl(pathname), {
        method: "GET",
        headers: buildGitHubHeaders(token)
      });

      if (!response.ok) {
        throw await toGitHubError(response, repositorySlug, pathname);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, buffer);
    }
  };
}

export function buildGitHubUrl(pathname, searchParams) {
  const url = new URL(pathname, GITHUB_API_BASE_URL);
  if (searchParams) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.set(key, value);
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
    "User-Agent": "bg3dc-remote-macos-build",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
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

  return new RemoteBuildError(
    `GitHub API request failed (${response.status}) for ${repositorySlug}${pathname}.${details}`.trim()
  );
}

export async function extractZipArchive({ archivePath, destinationPath, commandRunner = runCommand }) {
  if (process.platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${escapePowerShellString(
      archivePath
    )}' -DestinationPath '${escapePowerShellString(destinationPath)}' -Force`;
    await commandRunner("pwsh.exe", ["-NoProfile", "-Command", command], {
      cwd: destinationPath
    });
    return;
  }

  await commandRunner("unzip", ["-q", archivePath, "-d", destinationPath], {
    cwd: destinationPath
  });
}

export function escapePowerShellString(value) {
  return value.replace(/'/gu, "''");
}

export async function resolveRemoteHeadSha(commandRunner, ref, cwd) {
  const output = await gitStdout(
    commandRunner,
    ["ls-remote", "--exit-code", "origin", `${BRANCH_REF_PREFIX}${ref}`],
    { cwd }
  );
  const [sha] = output.split(/\s+/u);
  if (!sha) {
    throw new RemoteBuildError(`Unable to resolve origin/${ref}. Push the branch first.`);
  }
  return sha;
}

export async function gitStdout(commandRunner, args, options) {
  const result = await commandRunner("git", args, options);
  return result.stdout.trim();
}

export async function runCommand(command, args, { cwd } = {}) {
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
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new RemoteBuildError(
          `Command failed (${command} ${args.join(" ")}): ${stderr.trim() || stdout.trim()}`
        )
      );
    });
  });
}

export function defaultSleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function main() {
  try {
    const result = await runRemoteMacosBuild();
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
