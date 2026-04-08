use serde::Serialize;
use std::path::Path;
use std::process::Command;

// ── Result types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct ScaffoldStep {
    pub label: String,
    /// "ok" | "error" | "skipped"
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ScaffoldResult {
    pub project_path: String,
    pub slug: String,
    pub github_url: Option<String>,
    pub vercel_project_url: Option<String>,
    pub supabase_project_id: Option<String>,
    pub supabase_db_password: Option<String>,
    pub steps: Vec<ScaffoldStep>,
}

impl ScaffoldStep {
    fn ok(label: impl Into<String>) -> Self {
        Self { label: label.into(), status: "ok".into(), detail: None }
    }
    fn ok_detail(label: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { label: label.into(), status: "ok".into(), detail: Some(detail.into()) }
    }
    fn err(label: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { label: label.into(), status: "error".into(), detail: Some(detail.into()) }
    }
    fn skipped(label: impl Into<String>, reason: impl Into<String>) -> Self {
        Self { label: label.into(), status: "skipped".into(), detail: Some(reason.into()) }
    }
}

// ── Slug helper ───────────────────────────────────────────────────────────────

pub fn to_slug(name: &str) -> String {
    let raw: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    raw.split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Password helper ───────────────────────────────────────────────────────────

fn generate_db_password() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(987654321);
    format!("Sb{nanos:08x}X!")
}

// ── File templates ────────────────────────────────────────────────────────────

// Versions are pinned exactly (no ^ or ~).
// Update these when refreshing the template — they are the versions that will be
// installed and committed to package-lock.json on first `npm install`.
const TMPL_PACKAGE_JSON: &str = r#"{
  "name": "{{slug}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "@supabase/ssr": "0.5.2",
    "@supabase/supabase-js": "2.46.2"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "20.17.6",
    "@types/react": "19.0.4",
    "@types/react-dom": "19.0.2",
    "tailwindcss": "4.0.6",
    "@tailwindcss/postcss": "4.0.6",
    "eslint": "9.17.0",
    "eslint-config-next": "15.1.0"
  }
}
"#;

// Force exact versions on any future `npm install --save`.
// Do not add ^ or ~ to package.json without a documented reason.
const TMPL_NPMRC: &str = "save-exact=true\n";

const TMPL_TSCONFIG: &str = r#"{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
"#;

const TMPL_NEXT_CONFIG: &str = r#"import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
"#;

const TMPL_POSTCSS: &str = r#"const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
"#;

const TMPL_GLOBALS_CSS: &str = r#"@import "tailwindcss";
"#;

const TMPL_LAYOUT: &str = r#"import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "{{name}}",
  description: "{{description}}",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
"#;

const TMPL_PAGE: &str = r#"export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">{{name}}</h1>
      <p className="mt-2 text-gray-600">{{description}}</p>
    </main>
  );
}
"#;

const TMPL_SUPABASE_CLIENT: &str = r#"import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
"#;

const TMPL_SUPABASE_SERVER: &str = r#"import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    }
  );
}
"#;

const TMPL_SUPABASE_MIDDLEWARE: &str = r#"import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — do not add logic between here and getUser()
  await supabase.auth.getUser();

  return supabaseResponse;
}
"#;

const TMPL_MIDDLEWARE: &str = r#"import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
"#;

const TMPL_ENV_EXAMPLE: &str = r#"# Supabase — copy from your project's API settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
"#;

const TMPL_ENV_LOCAL: &str = r#"# Local environment — NOT committed to git
# Copy values from your Supabase project: Settings > API

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
"#;

const TMPL_GITIGNORE: &str = r#"# Dependencies
/node_modules
/.pnp
.pnp.js
.yarn/install-state.gz

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
"#;

// Requires package-lock.json to be committed (enforced by npm ci).
// dependency-review runs on PRs; it requires GitHub Advanced Security for private repos
// but is free for all public repos.
const TMPL_CI_WORKFLOW: &str = r#"# CI — runs on every push to main and on all pull requests.
# Requires package-lock.json to be committed. Run `npm install` locally and
# commit package-lock.json before your first push, or this workflow will fail.

name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run lint
      - run: npm run build

  dependency-review:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
"#;

/// Substitute `{{name}}`, `{{slug}}`, and `{{description}}` tokens in the four
/// files that carry per-project identity.  All other template files are static
/// and will be copied verbatim from the GitHub template repo when that flow is
/// wired up; only these four need touching after the clone.
///
/// This function works on any directory — a freshly cloned template repo or a
/// locally-generated scaffold — making it the natural seam between the two flows.
pub fn apply_project_customization(
    dir: &Path,
    name: &str,
    slug: &str,
    desc: &str,
) -> Result<(), String> {
    patch_file(dir, "package.json",   name, slug, desc)?;
    patch_file(dir, "README.md",      name, slug, desc)?;
    patch_file(dir, "app/layout.tsx", name, slug, desc)?;
    patch_file(dir, "app/page.tsx",   name, slug, desc)?;
    Ok(())
}

/// Read a file, replace all three tokens, write it back.
fn patch_file(dir: &Path, rel: &str, name: &str, slug: &str, desc: &str) -> Result<(), String> {
    let path = dir.join(rel);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("read {rel}: {e}"))?;
    let patched = content
        .replace("{{name}}", name)
        .replace("{{slug}}", slug)
        .replace("{{description}}", desc);
    std::fs::write(&path, patched)
        .map_err(|e| format!("write {rel}: {e}"))
}

fn readme_template(name: &str, description: &str, slug: &str) -> String {
    format!(
        r#"# {name}

{description}

## Stack

- [Next.js](https://nextjs.org/) — React framework (App Router)
- [Supabase](https://supabase.com/) — PostgreSQL database + Auth
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Vercel](https://vercel.com/) — deployment

## Getting started

```bash
cd {slug}
npm install
cp .env.example .env.local
```

> **Commit `package-lock.json`** before your first push — it records the exact versions
> installed and is required by CI (`npm ci` reads from it strictly).

Edit `.env.local` with values from your Supabase project's **Settings → API** page, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

```bash
npm install -g vercel
vercel
```
"#
    )
}

// ── Local file scaffold ───────────────────────────────────────────────────────

fn write_file(dir: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    let full = dir.join(rel_path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create dir {}: {e}", parent.display()))?;
    }
    std::fs::write(&full, content)
        .map_err(|e| format!("write {rel_path}: {e}"))
}

pub fn create_local_files(
    project_dir: &Path,
    name: &str,
    slug: &str,
    desc: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(project_dir)
        .map_err(|e| format!("create project dir: {e}"))?;

    // ── Template-owned (static — identical for every project) ──────────────
    write_file(project_dir, ".npmrc",                       TMPL_NPMRC)?;
    write_file(project_dir, "tsconfig.json",                TMPL_TSCONFIG)?;
    write_file(project_dir, "next.config.ts",               TMPL_NEXT_CONFIG)?;
    write_file(project_dir, "postcss.config.mjs",           TMPL_POSTCSS)?;
    write_file(project_dir, "middleware.ts",                 TMPL_MIDDLEWARE)?;
    write_file(project_dir, ".env.example",                  TMPL_ENV_EXAMPLE)?;
    write_file(project_dir, ".env.local",                    TMPL_ENV_LOCAL)?;
    write_file(project_dir, ".gitignore",                    TMPL_GITIGNORE)?;
    write_file(project_dir, "app/globals.css",               TMPL_GLOBALS_CSS)?;
    write_file(project_dir, "lib/supabase/client.ts",        TMPL_SUPABASE_CLIENT)?;
    write_file(project_dir, "lib/supabase/server.ts",        TMPL_SUPABASE_SERVER)?;
    write_file(project_dir, "lib/supabase/middleware.ts",    TMPL_SUPABASE_MIDDLEWARE)?;
    write_file(project_dir, "components/.gitkeep",           "")?;
    write_file(project_dir, "public/.gitkeep",               "")?;
    write_file(project_dir, ".github/workflows/ci.yml",      TMPL_CI_WORKFLOW)?;

    // ── Template-owned (project tokens — substituted after clone) ──────────
    // Write the raw token-bearing templates first, then substitute in place.
    write_file(project_dir, "package.json",   TMPL_PACKAGE_JSON)?;
    write_file(project_dir, "README.md",      &readme_template("{{name}}", "{{description}}", "{{slug}}"))?;
    write_file(project_dir, "app/layout.tsx", TMPL_LAYOUT)?;
    write_file(project_dir, "app/page.tsx",   TMPL_PAGE)?;
    apply_project_customization(project_dir, name, slug, desc)?;

    Ok(())
}

// ── Git init ──────────────────────────────────────────────────────────────────

pub fn run_git_init(project_dir: &Path, path_env: &str) -> ScaffoldStep {
    let run = |args: &[&str]| -> Result<(), String> {
        let out = Command::new("git")
            .args(args)
            .current_dir(project_dir)
            .env("PATH", path_env)
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).into_owned())
        }
    };

    if let Err(e) = run(&["init"]) {
        return ScaffoldStep::err("git init", e);
    }
    if let Err(e) = run(&["add", "."]) {
        return ScaffoldStep::err("git init (add)", e);
    }
    if let Err(e) = run(&[
        "-c", "user.email=scaffold@projecttrack",
        "-c", "user.name=Project Track",
        "commit", "-m", "Initial scaffold",
    ]) {
        return ScaffoldStep::err("git init (commit)", e);
    }
    ScaffoldStep::ok("git init + initial commit")
}

// ── Commit and push (template flow) ──────────────────────────────────────────

/// Stage all changes and commit + push to origin.
/// Used in the GitHub-template flow where the repo is already initialised
/// (cloned from template) and just needs the Launchpad customisations committed.
pub fn commit_and_push(project_dir: &Path, path_env: &str) -> ScaffoldStep {
    let run = |args: &[&str]| -> Result<(), String> {
        let out = Command::new("git")
            .args(args)
            .current_dir(project_dir)
            .env("PATH", path_env)
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).into_owned())
        }
    };

    if let Err(e) = run(&["add", "-A"]) {
        return ScaffoldStep::err("commit customisations (add)", e);
    }
    if let Err(e) = run(&[
        "-c", "user.email=scaffold@launchpad",
        "-c", "user.name=Launchpad",
        "commit", "-m", "Launchpad customisation",
    ]) {
        return ScaffoldStep::err("commit customisations (commit)", e);
    }
    if let Err(e) = run(&["push"]) {
        return ScaffoldStep::err("commit customisations (push)", e);
    }
    ScaffoldStep::ok("Committed and pushed customisations")
}

// ── GitHub repo creation ──────────────────────────────────────────────────────

pub fn create_github_repo(
    project_dir: &Path,
    slug: &str,
    path_env: &str,
) -> (ScaffoldStep, Option<String>) {
    // gh repo create <slug> --private --source=. --remote=origin --push
    let out = Command::new("gh")
        .args(["repo", "create", slug, "--private", "--source=.", "--remote=origin", "--push"])
        .current_dir(project_dir)
        .env("PATH", path_env)
        .output();

    match out {
        Err(e) => (
            ScaffoldStep::err("GitHub repo", format!("gh CLI not found: {e}")),
            None,
        ),
        Ok(o) if !o.status.success() => {
            let stderr = String::from_utf8_lossy(&o.stderr).into_owned();
            (ScaffoldStep::err("GitHub repo", stderr), None)
        }
        Ok(o) => {
            // Parse repo URL from stdout (gh prints it)
            let stdout = String::from_utf8_lossy(&o.stdout).into_owned();
            let url = stdout
                .lines()
                .find(|l| l.contains("github.com"))
                .map(|l| l.trim().to_string());
            let detail = url.clone().unwrap_or_else(|| "created".to_string());
            (ScaffoldStep::ok_detail("GitHub repo", detail.clone()), url)
        }
    }
}

// ── Vercel project creation ───────────────────────────────────────────────────

pub fn create_vercel_project(
    name: &str,
    slug: &str,
    token: &str,
) -> (ScaffoldStep, Option<String>) {
    let body = serde_json::json!({
        "name": slug,
        "framework": "nextjs"
    });

    let resp = ureq::post("https://api.vercel.com/v9/projects")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .send_json(body);

    match resp {
        Err(ureq::Error::Status(409, _)) => {
            // Project already exists — not a fatal error
            let url = format!("https://vercel.com/{slug}");
            (
                ScaffoldStep::ok_detail("Vercel project", "already exists"),
                Some(url),
            )
        }
        Err(e) => (ScaffoldStep::err("Vercel project", e.to_string()), None),
        Ok(r) => {
            let json: serde_json::Value = r.into_json().unwrap_or_default();
            let id = json["id"].as_str().unwrap_or("").to_string();
            let proj_name = json["name"].as_str().unwrap_or(name).to_string();
            let url = format!("https://vercel.com/{proj_name}");
            let detail = if id.is_empty() {
                "created".to_string()
            } else {
                format!("id={id}")
            };
            (ScaffoldStep::ok_detail("Vercel project", detail), Some(url))
        }
    }
}

// ── Supabase project creation ─────────────────────────────────────────────────

pub fn create_supabase_project(
    name: &str,
    slug: &str,
    org_id: &str,
    token: &str,
) -> (ScaffoldStep, Option<String>, Option<String>) {
    let db_pass = generate_db_password();

    let body = serde_json::json!({
        "name": slug,
        "organization_id": org_id,
        "db_pass": db_pass,
        "region": "us-east-1"
    });

    let resp = ureq::post("https://api.supabase.com/v1/projects")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .send_json(body);

    match resp {
        Err(e) => (
            ScaffoldStep::err("Supabase project", e.to_string()),
            None,
            None,
        ),
        Ok(r) => {
            let json: serde_json::Value = r.into_json().unwrap_or_default();
            let project_id = json["id"].as_str().unwrap_or("").to_string();
            if project_id.is_empty() {
                let err = json["message"]
                    .as_str()
                    .unwrap_or("unexpected response")
                    .to_string();
                return (ScaffoldStep::err("Supabase project", err), None, None);
            }
            let _ = name; // suppress unused warning
            (
                ScaffoldStep::ok_detail(
                    "Supabase project",
                    format!("provisioning… project ref={project_id}"),
                ),
                Some(project_id),
                Some(db_pass),
            )
        }
    }
}

// ── GitHub repo archiving ─────────────────────────────────────────────────────

/// Renames the GitHub repo associated with `local_repo_path` to
/// `{repo}-archived-{YYYY-MM}` and marks it as archived on GitHub.
/// Returns the final `owner/new-name` string on success.
pub fn archive_github_repo(local_repo_path: &str, path_env: &str) -> Result<String, String> {
    let path = Path::new(local_repo_path);
    if !path.exists() {
        return Err(format!("Local repo path does not exist: {local_repo_path}"));
    }

    // Read git remote URL
    let remote_out = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(path)
        .env("PATH", path_env)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !remote_out.status.success() {
        return Err("No git remote 'origin' found for this project".to_string());
    }

    let remote_url = String::from_utf8_lossy(&remote_out.stdout).trim().to_string();
    let owner_repo = parse_github_owner_repo(&remote_url)
        .ok_or_else(|| format!("Could not parse GitHub owner/repo from remote: {remote_url}"))?;

    let parts: Vec<&str> = owner_repo.splitn(2, '/').collect();
    if parts.len() != 2 {
        return Err(format!("Unexpected owner/repo format: {owner_repo}"));
    }
    let owner    = parts[0];
    let repo     = parts[1];
    let new_name = format!("{repo}-archived-{}", year_month());

    // Step 1: rename
    let rename_out = Command::new("gh")
        .args(["api", &format!("repos/{owner}/{repo}"),
               "-X", "PATCH", "-F", &format!("name={new_name}")])
        .env("PATH", path_env)
        .output()
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !rename_out.status.success() {
        let stderr = String::from_utf8_lossy(&rename_out.stderr).into_owned();
        return Err(format!("Failed to rename repo: {stderr}"));
    }

    // Step 2: archive
    let archive_out = Command::new("gh")
        .args(["api", &format!("repos/{owner}/{new_name}"),
               "-X", "PATCH", "-F", "archived=true"])
        .env("PATH", path_env)
        .output()
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !archive_out.status.success() {
        let stderr = String::from_utf8_lossy(&archive_out.stderr).into_owned();
        return Err(format!("Renamed to {new_name} but archive failed: {stderr}"));
    }

    Ok(format!("{owner}/{new_name}"))
}

fn parse_github_owner_repo(url: &str) -> Option<String> {
    // https://github.com/owner/repo.git  or  https://github.com/owner/repo
    if let Some(rest) = url.strip_prefix("https://github.com/") {
        let s = rest.trim_end_matches('/').trim_end_matches(".git");
        if s.contains('/') { return Some(s.to_string()); }
    }
    // git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let s = rest.trim_end_matches(".git");
        if s.contains('/') { return Some(s.to_string()); }
    }
    None
}

fn year_month() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let z   = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y   = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp  = (5 * doy + 2) / 153;
    let m   = if mp < 10 { mp + 3 } else { mp - 9 };
    let y   = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}", y, m)
}

// ── Check gh CLI ──────────────────────────────────────────────────────────────

pub fn check_gh_cli(path_env: &str) -> bool {
    Command::new("gh")
        .args(["auth", "status"])
        .env("PATH", path_env)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── Main scaffold entry point ─────────────────────────────────────────────────

pub struct ScaffoldRequest {
    pub project_name: String,
    pub description: String,
    pub projects_dir: String,
    pub create_github: bool,
    pub create_vercel: bool,
    pub create_supabase: bool,
    pub vercel_token: String,
    pub supabase_token: String,
    pub supabase_org_id: String,
    pub path_env: String,
}

pub fn scaffold_project(req: ScaffoldRequest) -> ScaffoldResult {
    let slug = to_slug(&req.project_name);
    if slug.is_empty() {
        return ScaffoldResult {
            project_path: String::new(),
            slug: String::new(),
            github_url: None,
            vercel_project_url: None,
            supabase_project_id: None,
            supabase_db_password: None,
            steps: vec![ScaffoldStep::err(
                "Validate project name",
                "Project name must contain at least one letter or number",
            )],
        };
    }
    let projects_dir = req.projects_dir.replace('~', &std::env::var("HOME").unwrap_or_default());
    let project_dir = Path::new(&projects_dir).join(&slug);
    let project_path = project_dir.to_string_lossy().to_string();

    let mut steps: Vec<ScaffoldStep> = Vec::new();
    let mut github_url: Option<String> = None;
    let mut vercel_url: Option<String> = None;
    let mut supabase_id: Option<String> = None;
    let mut supabase_pass: Option<String> = None;

    // Step 1: Create local files
    match create_local_files(&project_dir, &req.project_name, &slug, &req.description) {
        Ok(()) => steps.push(ScaffoldStep::ok("Created project files")),
        Err(e) => {
            steps.push(ScaffoldStep::err("Create project files", e));
            return ScaffoldResult {
                project_path,
                slug,
                github_url,
                vercel_project_url: vercel_url,
                supabase_project_id: supabase_id,
                supabase_db_password: supabase_pass,
                steps,
            };
        }
    }

    // Step 2: git init
    steps.push(run_git_init(&project_dir, &req.path_env));

    // Step 3: GitHub
    if req.create_github {
        let (step, url) = create_github_repo(&project_dir, &slug, &req.path_env);
        github_url = url;
        steps.push(step);
    } else {
        steps.push(ScaffoldStep::skipped("GitHub repo", "not requested"));
    }

    // Step 4: Vercel
    if req.create_vercel {
        if req.vercel_token.is_empty() {
            steps.push(ScaffoldStep::skipped("Vercel project", "no token in Settings"));
        } else {
            let (step, url) = create_vercel_project(&req.project_name, &slug, &req.vercel_token);
            vercel_url = url;
            steps.push(step);
        }
    } else {
        steps.push(ScaffoldStep::skipped("Vercel project", "not requested"));
    }

    // Step 5: Supabase
    if req.create_supabase {
        if req.supabase_token.is_empty() || req.supabase_org_id.is_empty() {
            steps.push(ScaffoldStep::skipped(
                "Supabase project",
                "token or org ID missing in Settings",
            ));
        } else {
            let (step, id, pass) = create_supabase_project(
                &req.project_name,
                &slug,
                &req.supabase_org_id,
                &req.supabase_token,
            );
            supabase_id = id;
            supabase_pass = pass;
            steps.push(step);
        }
    } else {
        steps.push(ScaffoldStep::skipped("Supabase project", "not requested"));
    }

    ScaffoldResult {
        project_path,
        slug,
        github_url,
        vercel_project_url: vercel_url,
        supabase_project_id: supabase_id,
        supabase_db_password: supabase_pass,
        steps,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn create_local_files_generates_security_defaults() {
        let dir = std::env::temp_dir().join("launchpad_scaffold_test");
        let _ = fs::remove_dir_all(&dir); // clean up any previous run

        create_local_files(&dir, "Test App", "test-app", "A test project").unwrap();

        // Versions are pinned (no ^ or ~)
        let pkg = fs::read_to_string(dir.join("package.json")).unwrap();
        assert!(!pkg.contains("\"^"), "package.json should not have ^ ranges");
        assert!(!pkg.contains("\"~"), "package.json should not have ~ ranges");
        assert!(pkg.contains("\"15.1.0\""), "next should be pinned to 15.1.0");
        assert!(pkg.contains("\"19.0.0\""), "react should be pinned");

        // .npmrc forces exact saves
        let npmrc = fs::read_to_string(dir.join(".npmrc")).unwrap();
        assert!(npmrc.contains("save-exact=true"), ".npmrc should contain save-exact=true");

        // CI workflow is present and uses npm ci
        let ci = fs::read_to_string(dir.join(".github/workflows/ci.yml")).unwrap();
        assert!(ci.contains("npm ci"), "CI should use npm ci");
        assert!(ci.contains("npm audit"), "CI should run npm audit");
        assert!(ci.contains("dependency-review-action"), "CI should include dependency-review");

        // README notes the lockfile
        let readme = fs::read_to_string(dir.join("README.md")).unwrap();
        assert!(readme.contains("package-lock.json"), "README should mention package-lock.json");

        let _ = fs::remove_dir_all(&dir);
    }
}
