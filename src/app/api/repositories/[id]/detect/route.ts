import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { Octokit } from "@octokit/rest";
import { FRAMEWORK_PRESETS } from "@/lib/presets";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: params.id },
      include: { config: true },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const baseRoot = process.env.DEPLOYMENT_ROOT || path.join(process.cwd(), "data", "deployments");
    const localDir = repo.config?.basePath && repo.config.basePath.trim().length > 0
      ? path.resolve(repo.config.basePath)
      : path.resolve(path.join(baseRoot, repo.owner, repo.name));

    let fileList: string[] = [];
    let subdirectories: string[] = [];

    // 1. If repository exists locally on server, scan directory
    if (fs.existsSync(localDir)) {
      try {
        const entries = fs.readdirSync(localDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === ".git" || entry.name === "node_modules") continue;
          if (entry.isDirectory()) {
            subdirectories.push(entry.name);
            fileList.push(`${entry.name}/`);
            try {
              const subEntries = fs.readdirSync(path.join(localDir, entry.name));
              for (const sub of subEntries) {
                fileList.push(`${entry.name}/${sub}`);
              }
            } catch {}
          } else {
            fileList.push(entry.name);
          }
        }
      } catch (e) {
        console.warn("Local scan failed, trying GitHub API:", e);
      }
    }

    // 2. If no local files or empty, fetch file tree from GitHub API
    if (fileList.length === 0) {
      const connection = await prisma.githubConnection.findFirst({
        orderBy: { createdAt: "desc" },
      });

      if (connection) {
        try {
          const token = decrypt(connection.encryptedAccessToken);
          const octokit = new Octokit({ auth: token });
          const { data: contents } = await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: "",
          });

          if (Array.isArray(contents)) {
            for (const item of contents) {
              if (item.type === "dir") {
                subdirectories.push(item.name);
                fileList.push(`${item.name}/`);
              } else {
                fileList.push(item.name);
              }
            }

            // Check contents inside common subdirectories like 'frontend' and 'backend'
            for (const sub of ["frontend", "backend", "client", "server", "app", "web", "api"]) {
              if (subdirectories.includes(sub)) {
                try {
                  const { data: subContents } = await octokit.rest.repos.getContent({
                    owner: repo.owner,
                    repo: repo.name,
                    path: sub,
                  });
                  if (Array.isArray(subContents)) {
                    for (const sItem of subContents) {
                      fileList.push(`${sub}/${sItem.name}`);
                    }
                  }
                } catch {}
              }
            }
          }
        } catch (ghErr) {
          console.warn("GitHub tree fetch failed:", ghErr);
        }
      }
    }

    // 3. Framework analysis & recommendation
    let recommendedPresetId = "custom";
    let recommendedRootDir = "";
    let detectionReason = "Default generic preset";

    const hasFile = (pattern: string) => fileList.includes(pattern);
    const hasPattern = (regex: RegExp) => fileList.some((f) => regex.test(f));

    // Check for Docker Compose
    if (hasFile("docker-compose.yml") || hasFile("docker-compose.yaml")) {
      recommendedPresetId = "docker-compose";
      recommendedRootDir = "";
      detectionReason = "Found docker-compose.yml in project root";
    }
    // Check for Frontend subfolder with Vite/React
    else if (hasFile("frontend/vite.config.js") || hasFile("frontend/vite.config.ts") || hasFile("frontend/package.json")) {
      recommendedPresetId = "vite";
      recommendedRootDir = "frontend";
      detectionReason = "Found Vite/React project inside 'frontend/' folder";
    }
    // Check for Frontend subfolder with Next.js
    else if (hasFile("frontend/next.config.js") || hasFile("frontend/next.config.mjs") || hasFile("frontend/next.config.ts")) {
      recommendedPresetId = "nextjs";
      recommendedRootDir = "frontend";
      detectionReason = "Found Next.js project inside 'frontend/' folder";
    }
    // Check for Backend subfolder with Python FastAPI / Flask / Django
    else if (hasFile("backend/requirements.txt") || hasFile("backend/main.py") || hasFile("backend/app/main.py")) {
      recommendedPresetId = "fastapi";
      recommendedRootDir = "backend";
      detectionReason = "Found Python backend inside 'backend/' folder";
    }
    // Check root Next.js
    else if (hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts") || hasFile("pages") || hasFile("app")) {
      recommendedPresetId = "nextjs";
      recommendedRootDir = "";
      detectionReason = "Found Next.js project structure in root";
    }
    // Check root Vite
    else if (hasFile("vite.config.js") || hasFile("vite.config.ts")) {
      recommendedPresetId = "vite";
      recommendedRootDir = "";
      detectionReason = "Found vite.config file in root";
    }
    // Check root Python
    else if (hasFile("requirements.txt") || hasFile("Pipfile") || hasFile("pyproject.toml")) {
      if (hasFile("manage.py")) {
        recommendedPresetId = "django";
        detectionReason = "Found Django manage.py in root";
      } else {
        recommendedPresetId = "fastapi";
        detectionReason = "Found Python requirements.txt in root";
      }
      recommendedRootDir = "";
    }
    // Check root Node.js / Express
    else if (hasFile("package.json")) {
      recommendedPresetId = "express";
      recommendedRootDir = "";
      detectionReason = "Found Node.js package.json in root";
    }
    // Check root Dockerfile
    else if (hasFile("Dockerfile")) {
      recommendedPresetId = "dockerfile";
      recommendedRootDir = "";
      detectionReason = "Found Dockerfile in root";
    }

    const preset = FRAMEWORK_PRESETS.find((p) => p.id === recommendedPresetId) || FRAMEWORK_PRESETS.find((p) => p.id === "custom")!;

    return NextResponse.json({
      success: true,
      detection: {
        recommendedPresetId,
        recommendedRootDir,
        detectionReason,
        detectedFiles: fileList.slice(0, 30),
        subdirectories,
        preset,
      },
      availablePresets: FRAMEWORK_PRESETS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
