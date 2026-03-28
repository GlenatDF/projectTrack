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
    "next": "^15",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "^15"
  }
}
"#;

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

# Copy and fill in your Supabase credentials
cp .env.example .env.local
```

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

fn apply(template: &str, name: &str, slug: &str, desc: &str) -> String {
    template
        .replace("{{name}}", name)
        .replace("{{slug}}", slug)
        .replace("{{description}}", desc)
}

pub fn create_local_files(
    project_dir: &Path,
    name: &str,
    slug: &str,
    desc: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(project_dir)
        .map_err(|e| format!("create project dir: {e}"))?;

    let a = |t: &str| apply(t, name, slug, desc);

    write_file(project_dir, "package.json",          &a(TMPL_PACKAGE_JSON))?;
    write_file(project_dir, "tsconfig.json",          &a(TMPL_TSCONFIG))?;
    write_file(project_dir, "next.config.ts",         &a(TMPL_NEXT_CONFIG))?;
    write_file(project_dir, "postcss.config.mjs",     &a(TMPL_POSTCSS))?;
    write_file(project_dir, "middleware.ts",           &a(TMPL_MIDDLEWARE))?;
    write_file(project_dir, ".env.example",            &a(TMPL_ENV_EXAMPLE))?;
    write_file(project_dir, ".env.local",              &a(TMPL_ENV_LOCAL))?;
    write_file(project_dir, ".gitignore",              &a(TMPL_GITIGNORE))?;
    write_file(project_dir, "README.md",               &readme_template(name, desc, slug))?;
    write_file(project_dir, "app/globals.css",         &a(TMPL_GLOBALS_CSS))?;
    write_file(project_dir, "app/layout.tsx",          &a(TMPL_LAYOUT))?;
    write_file(project_dir, "app/page.tsx",            &a(TMPL_PAGE))?;
    write_file(project_dir, "lib/supabase/client.ts",  &a(TMPL_SUPABASE_CLIENT))?;
    write_file(project_dir, "lib/supabase/server.ts",  &a(TMPL_SUPABASE_SERVER))?;
    write_file(project_dir, "lib/supabase/middleware.ts", &a(TMPL_SUPABASE_MIDDLEWARE))?;
    write_file(project_dir, "components/.gitkeep",    "")?;
    write_file(project_dir, "public/.gitkeep",        "")?;
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
