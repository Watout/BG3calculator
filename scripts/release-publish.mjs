import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL, pathToFileURL } from "node:url";

import { collectReleaseAssets, listFilesRecursively } from "./release-collect-assets.mjs";

const GITHUB_API_VERSION = "2022-11-28";

export class ReleasePublishError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePublishError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    apiBaseUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
    help: false,
    input: null,
    name: null,
    prerelease: false,
    repo: process.env.GITHUB_REPOSITORY ?? null,
    tag: null
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

    if (value === "--input") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --input.");
      }
      options.input = path.resolve(nextValue);
      index += 1;
      continue;
    }

    if (value === "--tag") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --tag.");
      }
      options.tag = nextValue;
      index += 1;
      continue;
    }

    if (value === "--name") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --name.");
      }
      options.name = nextValue;
      index += 1;
      continue;
    }

    if (value === "--repo") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --repo.");
      }
      options.repo = nextValue;
      index += 1;
      continue;
    }

    if (value === "--api-base-url") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --api-base-url.");
      }
      options.apiBaseUrl = nextValue;
      index += 1;
      continue;
    }

    if (value === "--prerelease") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePublishError("Missing value for --prerelease.");
      }
      options.prerelease = parseBoolean(nextValue, "--prerelease");
      index += 1;
      continue;
    }

    throw new ReleasePublishError(`Unknown argument: ${value}`);
  }

  return options;
}

export function parseBoolean(value, label) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ReleasePublishError(`${label} must be either "true" or "false".`);
}

export function printHelp() {
  return [
    "Usage: pnpm release:publish -- --input <dir> --tag <tag> --name <name> [options]",
    "",
    "Options:",
    "  --input <dir>              Directory created by the release artifact download step. Required.",
    "  --tag <tag>                Existing git tag to publish. Required.",
    "  --name <name>              Release title to sync on GitHub. Required.",
    "  --prerelease <bool>        Whether the release should be marked prerelease. Defaults to false.",
    "  --repo <owner/name>        Override GITHUB_REPOSITORY.",
    "  --api-base-url <url>       Override GITHUB_API_URL. Defaults to https://api.github.com.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function resolveGitHubToken(env = process.env) {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN ?? null;
  if (!token) {
    throw new ReleasePublishError(
      "Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN before running release:publish."
    );
  }

  return token;
}

export function getDefaultFetch() {
  if (typeof globalThis.fetch !== "function") {
    throw new ReleasePublishError("Global fetch is unavailable in this Node.js runtime.");
  }

  return globalThis.fetch.bind(globalThis);
}

export function parseRepository(repo) {
  if (!repo) {
    throw new ReleasePublishError(
      "Missing GitHub repository. Set GITHUB_REPOSITORY or pass --repo <owner/name>."
    );
  }

  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length > 0) {
    throw new ReleasePublishError(
      `GitHub repository "${repo}" must use the owner/name format.`
    );
  }

  return { name, owner };
}

export async function collectReleaseFiles({
  input,
  readdirImpl = listFilesRecursively
}) {
  const files =
    readdirImpl === listFilesRecursively
      ? await listFilesRecursively(input)
      : await readdirImpl(input);
  const releaseFiles = collectReleaseAssets(files, { rootDir: input });
  ensureUniqueAssetNames(releaseFiles);
  return releaseFiles;
}

export function ensureUniqueAssetNames(filePaths) {
  const seen = new Map();

  for (const filePath of filePaths) {
    const assetName = path.basename(filePath);
    const previousPath = seen.get(assetName);
    if (previousPath) {
      throw new ReleasePublishError(
        `Release asset name collision detected for "${assetName}":\n- ${previousPath}\n- ${filePath}`
      );
    }

    seen.set(assetName, filePath);
  }
}

export async function githubRequest({
  apiBaseUrl,
  token,
  method = "GET",
  path: apiPath = null,
  url = null,
  body = null,
  contentType = "application/vnd.github+json",
  fetchImpl = getDefaultFetch(),
  allowNotFound = false
}) {
  const requestUrl = url ?? new URL(apiPath, ensureTrailingSlash(apiBaseUrl)).toString();
  const response = await fetchImpl(requestUrl, {
    body,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "User-Agent": "bg3calculator-release-publish",
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    },
    method
  });

  if (allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await formatGitHubError(response);
    throw new ReleasePublishError(
      `GitHub request failed (${method} ${requestUrl}): ${response.status} ${message}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  const responseType = response.headers.get("content-type") ?? "";
  if (responseType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

export async function formatGitHubError(response) {
  const responseType = response.headers.get("content-type") ?? "";

  if (responseType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload.message === "string") {
      return payload.message;
    }
  }

  const text = await response.text().catch(() => "");
  return text || response.statusText || "Unknown GitHub API error";
}

export async function findReleaseByTag({
  apiBaseUrl,
  owner,
  repo,
  tag,
  token,
  fetchImpl = getDefaultFetch()
}) {
  return githubRequest({
    allowNotFound: true,
    apiBaseUrl,
    fetchImpl,
    path: `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`,
    token
  });
}

export async function createRelease({
  apiBaseUrl,
  owner,
  repo,
  tag,
  name,
  prerelease,
  token,
  fetchImpl = getDefaultFetch()
}) {
  return githubRequest({
    apiBaseUrl,
    body: JSON.stringify({
      draft: false,
      generate_release_notes: true,
      name,
      prerelease,
      tag_name: tag
    }),
    fetchImpl,
    method: "POST",
    path: `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
    token
  });
}

export async function updateRelease({
  apiBaseUrl,
  owner,
  repo,
  releaseId,
  name,
  prerelease,
  token,
  fetchImpl = getDefaultFetch()
}) {
  return githubRequest({
    apiBaseUrl,
    body: JSON.stringify({
      draft: false,
      name,
      prerelease
    }),
    fetchImpl,
    method: "PATCH",
    path: `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}`,
    token
  });
}

export async function deleteReleaseAsset({
  apiBaseUrl,
  owner,
  repo,
  assetId,
  token,
  fetchImpl = getDefaultFetch()
}) {
  await githubRequest({
    apiBaseUrl,
    fetchImpl,
    method: "DELETE",
    path: `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${assetId}`,
    token
  });
}

export function buildUploadUrl(uploadUrlTemplate, assetName) {
  const baseUrl = uploadUrlTemplate.replace(/\{\?name,label\}$/u, "");
  const uploadUrl = new URL(baseUrl);
  uploadUrl.searchParams.set("name", assetName);
  return uploadUrl.toString();
}

export async function uploadReleaseAsset({
  filePath,
  release,
  token,
  fetchImpl = getDefaultFetch(),
  readFileImpl = readFile
}) {
  const assetName = path.basename(filePath);
  const uploadUrl = buildUploadUrl(release.upload_url, assetName);
  const fileContents = await readFileImpl(filePath);

  return githubRequest({
    body: fileContents,
    contentType: "application/octet-stream",
    fetchImpl,
    method: "POST",
    token,
    url: uploadUrl
  });
}

export async function ensureRelease({
  apiBaseUrl,
  owner,
  repo,
  tag,
  name,
  prerelease,
  token,
  fetchImpl = getDefaultFetch()
}) {
  const existingRelease = await findReleaseByTag({
    apiBaseUrl,
    fetchImpl,
    owner,
    repo,
    tag,
    token
  });

  if (!existingRelease) {
    return {
      created: true,
      release: await createRelease({
        apiBaseUrl,
        fetchImpl,
        name,
        owner,
        prerelease,
        repo,
        tag,
        token
      })
    };
  }

  return {
    created: false,
    release: await updateRelease({
      apiBaseUrl,
      fetchImpl,
      name,
      owner,
      prerelease,
      releaseId: existingRelease.id,
      repo,
      token
    })
  };
}

export async function uploadReleaseAssets({
  apiBaseUrl,
  owner,
  repo,
  release,
  token,
  releaseFiles,
  fetchImpl = getDefaultFetch(),
  readFileImpl = readFile
}) {
  const assets = Array.isArray(release.assets) ? [...release.assets] : [];
  const uploadedAssets = [];

  for (const filePath of releaseFiles) {
    const assetName = path.basename(filePath);
    const existingAsset = assets.find((asset) => asset.name === assetName);

    if (existingAsset) {
      await deleteReleaseAsset({
        apiBaseUrl,
        assetId: existingAsset.id,
        fetchImpl,
        owner,
        repo,
        token
      });
    }

    const uploadedAsset = await uploadReleaseAsset({
      fetchImpl,
      filePath,
      readFileImpl,
      release,
      token
    });

    const nextAssets = assets.filter((asset) => asset.name !== uploadedAsset.name);
    nextAssets.push(uploadedAsset);
    assets.splice(0, assets.length, ...nextAssets);
    uploadedAssets.push(uploadedAsset);
  }

  release.assets = assets;
  return uploadedAssets;
}

export async function runReleasePublish({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = getDefaultFetch(),
  readFileImpl = readFile,
  readdirImpl = listFilesRecursively
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.input) {
    throw new ReleasePublishError("Missing required --input argument.");
  }

  if (!options.tag) {
    throw new ReleasePublishError("Missing required --tag argument.");
  }

  if (!options.name) {
    throw new ReleasePublishError("Missing required --name argument.");
  }

  const token = resolveGitHubToken(env);
  const repository = parseRepository(options.repo ?? env.GITHUB_REPOSITORY ?? null);
  const releaseFiles = await collectReleaseFiles({
    input: options.input,
    readdirImpl
  });
  const { created, release } = await ensureRelease({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl,
    name: options.name,
    owner: repository.owner,
    prerelease: options.prerelease,
    repo: repository.name,
    tag: options.tag,
    token
  });
  const uploadedAssets = await uploadReleaseAssets({
    apiBaseUrl: options.apiBaseUrl,
    fetchImpl,
    owner: repository.owner,
    readFileImpl,
    release,
    releaseFiles,
    repo: repository.name,
    token
  });

  return {
    exitCode: 0,
    stdout: [
      `${created ? "Created" : "Updated"} GitHub release ${options.tag}.`,
      "Uploaded assets:",
      ...uploadedAssets.map((asset) => `- ${asset.name}`)
    ].join("\n")
  };
}

async function main() {
  try {
    const result = await runReleasePublish();
    if (result.stdout) {
      process.stdout.write(`${result.stdout}\n`);
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
