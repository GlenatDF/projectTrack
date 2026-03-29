use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct GitStatus {
    pub is_valid_repo: bool,
    pub current_branch: Option<String>,
    pub is_dirty: bool,
    pub changed_files_count: u32,
    pub untracked_files_count: u32,
    pub staged_files_count: u32,
    pub last_commit_hash: Option<String>,
    pub last_commit_date: Option<String>,
    pub last_commit_message: Option<String>,
    pub ahead_count: Option<i32>,
    pub behind_count: Option<i32>,
    pub error_message: Option<String>,
}

/// Locate the git binary. macOS bundles get a minimal PATH so we probe
/// common locations rather than relying on PATH alone.
fn git_binary() -> &'static str {
    // /usr/bin/git is the Xcode stub that is always present on macOS.
    // Try it first; fall back to plain "git" (works in dev with normal PATH).
    if std::path::Path::new("/usr/bin/git").exists() {
        "/usr/bin/git"
    } else {
        "git"
    }
}

/// Run a git subcommand inside `repo_path`. Returns trimmed stdout on success.
fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(git_binary())
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("git exec failed: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Returns true if `path` exists and is an accessible git repository.
pub fn is_valid_repo(path: &str) -> bool {
    let p = Path::new(path);
    if !p.exists() || !p.is_dir() {
        return false;
    }
    run_git(path, &["rev-parse", "--git-dir"]).is_ok()
}

/// Lightweight scan for repo discovery: 2 subprocess calls instead of 5.
/// Assumes the path is already known to be a valid git repo (.git exists).
/// Populates: is_valid_repo, current_branch, is_dirty, last_commit_date,
/// last_commit_message. All other fields are left at their defaults.
pub fn scan_repo_light(repo_path: &str) -> GitStatus {
    let mut status = GitStatus {
        is_valid_repo: true,
        ..Default::default()
    };

    // `--branch` adds a `## <branch>...` header line as the first line.
    // This gives us branch + dirty check in a single subprocess.
    if let Ok(porcelain) = run_git(repo_path, &["status", "--porcelain", "--branch"]) {
        let mut lines = porcelain.lines();
        if let Some(header) = lines.next() {
            // Header format: "## main...origin/main [ahead N]" or "## HEAD (no branch)"
            let branch_part = header.trim_start_matches("## ");
            let branch = branch_part
                .split("...")
                .next()
                .unwrap_or(branch_part)
                .trim();
            if !branch.is_empty() && branch != "HEAD (no branch)" {
                status.current_branch = Some(branch.to_string());
            }
        }
        status.is_dirty = lines.next().is_some();
    }

    // One subprocess for last commit date + message.
    if let Ok(log) = run_git(repo_path, &["log", "-1", "--format=%ai|%s"]) {
        if !log.is_empty() {
            let parts: Vec<&str> = log.splitn(2, '|').collect();
            if parts.len() == 2 {
                status.last_commit_date = Some(parts[0].to_string());
                status.last_commit_message = Some(parts[1].to_string());
            }
        }
    }

    status
}

/// Scan a git repository and return its current status snapshot.
pub fn scan_repo(repo_path: &str) -> GitStatus {
    if repo_path.is_empty() {
        return GitStatus {
            is_valid_repo: false,
            error_message: Some("No repository path configured".to_string()),
            ..Default::default()
        };
    }

    let path = Path::new(repo_path);

    if !path.exists() {
        return GitStatus {
            is_valid_repo: false,
            error_message: Some(format!("Path does not exist: {repo_path}")),
            ..Default::default()
        };
    }

    if !path.is_dir() {
        return GitStatus {
            is_valid_repo: false,
            error_message: Some(format!("Path is not a directory: {repo_path}")),
            ..Default::default()
        };
    }

    if run_git(repo_path, &["rev-parse", "--git-dir"]).is_err() {
        return GitStatus {
            is_valid_repo: false,
            error_message: Some("Not a git repository".to_string()),
            ..Default::default()
        };
    }

    let mut status = GitStatus {
        is_valid_repo: true,
        ..Default::default()
    };

    // Current branch (may be "HEAD" if detached)
    status.current_branch = run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).ok();

    // Porcelain status — parse per-line for accurate counts
    if let Ok(porcelain) = run_git(repo_path, &["status", "--porcelain"]) {
        let mut changed = 0u32;
        let mut untracked = 0u32;
        let mut staged = 0u32;

        for line in porcelain.lines() {
            if line.len() < 2 {
                continue;
            }
            let mut chars = line.chars();
            let x = chars.next().unwrap_or(' '); // index / staged
            let y = chars.next().unwrap_or(' '); // work-tree / unstaged

            if x == '?' && y == '?' {
                untracked += 1;
            } else {
                if x != ' ' {
                    staged += 1;
                }
                if y != ' ' {
                    changed += 1;
                }
            }
        }

        status.changed_files_count = changed;
        status.untracked_files_count = untracked;
        status.staged_files_count = staged;
        status.is_dirty = !porcelain.is_empty();
    }

    // Last commit: hash | ISO-8601 date | subject (subject may contain |)
    if let Ok(log) = run_git(repo_path, &["log", "-1", "--format=%H|%ai|%s"]) {
        if !log.is_empty() {
            let parts: Vec<&str> = log.splitn(3, '|').collect();
            if parts.len() == 3 {
                status.last_commit_hash = Some(parts[0].to_string());
                status.last_commit_date = Some(parts[1].to_string());
                status.last_commit_message = Some(parts[2].to_string());
            }
        }
    }

    // Ahead / behind relative to upstream — silently skipped if no upstream
    if let Ok(ab) = run_git(
        repo_path,
        &["rev-list", "--count", "--left-right", "@{u}...HEAD"],
    ) {
        let parts: Vec<&str> = ab.split_whitespace().collect();
        if parts.len() == 2 {
            status.behind_count = parts[0].parse().ok();
            status.ahead_count = parts[1].parse().ok();
        }
    }

    status
}
