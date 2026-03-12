import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const REQUIRED_ASSET_GROUPS = [
  {
    artifactName: "bg3calculator-windows-x64",
    id: "windows-msi",
    test: (filePath) => filePath.endsWith(".msi")
  },
  {
    artifactName: "bg3calculator-windows-x64",
    id: "windows-exe",
    test: (filePath) => filePath.endsWith(".exe")
  },
  {
    artifactName: "bg3calculator-macos-universal",
    id: "macos-dmg",
    test: (filePath) => filePath.endsWith(".dmg")
  }
];

export const OPTIONAL_ASSET_PATTERNS = [
  (filePath) => filePath.endsWith(".zip"),
  (filePath) => filePath.endsWith(".sig"),
  (filePath) => filePath.endsWith(".app.tar.gz")
];

export class ReleaseAssetError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseAssetError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    githubOutput: process.env.GITHUB_OUTPUT ?? null,
    help: false,
    input: null
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
        throw new ReleaseAssetError("Missing value for --input.");
      }
      options.input = path.resolve(nextValue);
      index += 1;
      continue;
    }

    if (value === "--github-output") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleaseAssetError("Missing value for --github-output.");
      }
      options.githubOutput = path.resolve(nextValue);
      index += 1;
      continue;
    }

    throw new ReleaseAssetError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm release:collect-assets -- --input <dir> [options]",
    "",
    "Options:",
    "  --input <dir>              Directory created by the release artifact download step. Required.",
    "  --github-output <path>     Optional GitHub Actions output file. Defaults to GITHUB_OUTPUT.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function isReleaseAsset(relativePath) {
  return (
    REQUIRED_ASSET_GROUPS.some((group) => group.test(relativePath)) ||
    OPTIONAL_ASSET_PATTERNS.some((test) => test(relativePath))
  );
}

export async function listFilesRecursively(rootDir, relativeDir = "", readdirImpl = readdir) {
  const directory = path.join(rootDir, relativeDir);
  const entries = await readdirImpl(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextRelativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(rootDir, nextRelativePath, readdirImpl)));
      continue;
    }

    if (entry.isFile()) {
      files.push(nextRelativePath);
    }
  }

  return files;
}

export function normalizeOutputPath(filePath) {
  return filePath.replace(/\\/gu, "/");
}

export function collectReleaseAssets(files, { rootDir }) {
  const matchedFiles = files
    .filter((relativePath) => isReleaseAsset(relativePath))
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => normalizeOutputPath(path.join(rootDir, relativePath)));

  if (matchedFiles.length === 0) {
    throw new ReleaseAssetError("No release files were found in the downloaded artifacts.");
  }

  for (const group of REQUIRED_ASSET_GROUPS) {
    const hasMatch = files.some((relativePath) => {
      const normalized = normalizeOutputPath(relativePath);
      return normalized.startsWith(`${group.artifactName}/`) && group.test(normalized);
    });

    if (!hasMatch) {
      throw new ReleaseAssetError(
        `Missing required release asset group "${group.id}" from downloaded artifacts.`
      );
    }
  }

  return matchedFiles;
}

export function formatGitHubOutputFiles(files) {
  return ["files<<EOF", ...files, "EOF"].join("\n");
}

export async function runReleaseCollectAssets({
  argv = process.argv.slice(2),
  readFileImpl = readFile,
  readdirImpl = readdir,
  writeFileImpl = writeFile
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.input) {
    throw new ReleaseAssetError("Missing required --input argument.");
  }

  const files = await listFilesRecursively(options.input, "", readdirImpl);
  const releaseFiles = collectReleaseAssets(files, {
    rootDir: options.input
  });

  if (options.githubOutput) {
    const existing = await readFileImpl(options.githubOutput, "utf8").catch(() => "");
    const outputBlock = formatGitHubOutputFiles(releaseFiles);
    const nextContents = existing ? `${existing.trimEnd()}\n${outputBlock}\n` : `${outputBlock}\n`;
    await writeFileImpl(options.githubOutput, nextContents, "utf8");
  }

  return {
    exitCode: 0,
    stdout: `${releaseFiles.join("\n")}\n`
  };
}

async function main() {
  try {
    const result = await runReleaseCollectAssets();
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
