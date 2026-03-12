import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import {
  ReleasePublishError,
  buildUploadUrl,
  parseCliArgs,
  runReleasePublish
} from "./release-publish.mjs";

async function createReleaseFixture(): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "bg3dc-release-publish-"));
  await mkdir(path.join(fixtureRoot, "bg3calculator-windows-x64"), {
    recursive: true
  });
  await mkdir(path.join(fixtureRoot, "bg3calculator-macos-universal"), {
    recursive: true
  });

  await writeFile(
    path.join(fixtureRoot, "bg3calculator-windows-x64", "BG3calculator_0.1.4_x64_en-US.msi"),
    "msi",
    "utf8"
  );
  await writeFile(
    path.join(fixtureRoot, "bg3calculator-windows-x64", "BG3calculator.exe"),
    "exe",
    "utf8"
  );
  await writeFile(
    path.join(fixtureRoot, "bg3calculator-macos-universal", "BG3calculator_0.1.4_universal.dmg"),
    "dmg",
    "utf8"
  );

  return fixtureRoot;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

describe("release publish script", (): void => {
  const fixtureRoots: string[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      fixtureRoots.splice(0, fixtureRoots.length).map((fixtureRoot) =>
        rm(fixtureRoot, { force: true, recursive: true })
      )
    );
  });

  it("ignores a standalone -- argument from pnpm script forwarding", (): void => {
    expect(
      parseCliArgs(["--", "--input", "release-assets", "--tag", "0.1.4", "--name", "0.1.4"])
    ).toEqual({
      apiBaseUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
      help: false,
      input: expect.any(String),
      name: "0.1.4",
      prerelease: false,
      repo: process.env.GITHUB_REPOSITORY ?? null,
      tag: "0.1.4"
    });
  });

  it("builds the asset upload url from the GitHub upload template", (): void => {
    expect(
      buildUploadUrl(
        "https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}",
        "BG3calculator.exe"
      )
    ).toBe(
      "https://uploads.github.com/repos/example/repo/releases/42/assets?name=BG3calculator.exe"
    );
  });

  it("creates a release and uploads all collected assets", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture();
    fixtureRoots.push(fixtureRoot);
    const requests: Array<{ method: string; url: string }> = [];

    const fetchImpl = async (
      input: string | URL | Request,
      init?: { method?: string }
    ): Promise<Response> => {
      const requestUrl = String(input);
      requests.push({
        method: init?.method ?? "GET",
        url: requestUrl
      });

      if (requestUrl.endsWith("/releases/tags/0.1.4")) {
        return createJsonResponse({ message: "Not Found" }, 404);
      }

      if (requestUrl.endsWith("/releases") && init?.method === "POST") {
        return createJsonResponse({
          assets: [],
          id: 42,
          upload_url: "https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}"
        });
      }

      if (requestUrl.startsWith("https://uploads.github.com/repos/example/repo/releases/42/assets?name=")) {
        const assetName = new URL(requestUrl).searchParams.get("name");
        return createJsonResponse({
          id: 100,
          name: assetName
        });
      }

      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${requestUrl}`);
    };

    const result = await runReleasePublish({
      argv: ["--input", fixtureRoot, "--tag", "0.1.4", "--name", "0.1.4"],
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "example/repo",
        GITHUB_TOKEN: "token"
      },
      fetchImpl
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Created GitHub release 0.1.4.");
    expect(requests).toHaveLength(5);
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "POST",
      "POST",
      "POST"
    ]);
  });

  it("updates an existing release and deletes duplicated assets before upload", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture();
    fixtureRoots.push(fixtureRoot);
    const requests: Array<{ method: string; url: string }> = [];

    const fetchImpl = async (
      input: string | URL | Request,
      init?: { method?: string }
    ): Promise<Response> => {
      const requestUrl = String(input);
      requests.push({
        method: init?.method ?? "GET",
        url: requestUrl
      });

      if (requestUrl.endsWith("/releases/tags/0.1.4")) {
        return createJsonResponse({
          assets: [
            {
              id: 7,
              name: "BG3calculator.exe"
            }
          ],
          id: 42,
          upload_url: "https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}"
        });
      }

      if (requestUrl.endsWith("/releases/42") && init?.method === "PATCH") {
        return createJsonResponse({
          assets: [
            {
              id: 7,
              name: "BG3calculator.exe"
            }
          ],
          id: 42,
          upload_url: "https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}"
        });
      }

      if (requestUrl.endsWith("/releases/assets/7") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      if (requestUrl.startsWith("https://uploads.github.com/repos/example/repo/releases/42/assets?name=")) {
        return createJsonResponse({
          id: 100,
          name: new URL(requestUrl).searchParams.get("name")
        });
      }

      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${requestUrl}`);
    };

    const result = await runReleasePublish({
      argv: [
        "--input",
        fixtureRoot,
        "--tag",
        "0.1.4",
        "--name",
        "0.1.4",
        "--prerelease",
        "true"
      ],
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "example/repo",
        GITHUB_TOKEN: "token"
      },
      fetchImpl
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Updated GitHub release 0.1.4.");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" && request.url.endsWith("/releases/assets/7")
      )
    ).toBe(true);
  });

  it("fails when the GitHub token is missing", async (): Promise<void> => {
    const fixtureRoot = await createReleaseFixture();
    fixtureRoots.push(fixtureRoot);

    await expect(
      runReleasePublish({
        argv: ["--input", fixtureRoot, "--tag", "0.1.4", "--name", "0.1.4"],
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "example/repo",
          GITHUB_TOKEN: ""
        }
      })
    ).rejects.toThrow(ReleasePublishError);
  });
});
