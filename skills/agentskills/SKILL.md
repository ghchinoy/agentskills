---
name: agentskills
description: Utilizes the agentskills CLI tool to recursively scan local directories or public GitHub profiles for workspace rule conventions (GEMINI.md), parsing them with gemini-3.5-flash to aggregate capabilities and identify duplication.
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# Skill: Utilizing the agentskills CLI Tool 🧠

This global skill instructs AI agents on when and how to leverage the **`agentskills`** CLI tool to inspect workspace rule patterns, query repository stacks, and coordinate instruction-sets dynamically.

---

## 🎯 Intent & Trigger Conditions
AI agents should invoke this skill when:
1.  **Entering a New Workspace:** To discover local tech stack boundaries, linter parameters, or custom developer rules.
2.  **Evaluating Instruction Duplication:** Before writing redundant READMEs, guidelines, or testing criteria inside a repository.
3.  **Auditing Codebase Standards:** To generate executive landscapes of a developer's local code directory or GitHub profile.

---

## 📋 Supported Agent & Workspace Rule Files
The CLI tool dynamically walks local directories or crawls GitHub repositories to locate and aggregate workspace rule formats for different agent models:
*   **Gemini**: `GEMINI.md`
*   **Claude**: `CLAUDE.md`
*   **OpenCode / Beads**: `AGENTS.md`
*   **Codex / Cursor**: `.cursorrules`, individual rules inside `.cursor/rules/*.mdc`, and `SYSTEM_PROMPT.md`

---

## 🛠️ Execution & Commands

### 0. Download & Installation (If CLI is Missing)
If the `agentskills` CLI is not installed on the system, download and install the latest release with:
```bash
curl -fsSL https://raw.githubusercontent.com/ghchinoy/agentskills/main/install.sh | bash
```
This script resolves the latest GitHub release, downloads and extracts the appropriate binary for your system architecture, installs it to `/usr/local/bin` (falling back to `~/.local/bin`), and registers the global agent skills to `~/.config/agentskills/skills/`.

Alternatively, if you have Go installed on your system, you can compile and install `agentskills` directly from source:
```bash
go install github.com/ghchinoy/agentskills@latest
```

### 1. Locate the Binary
*   When working directly in the development repository, compile the latest state using `make build` and invoke the compiled binary using its local path: `./bin/agentskills`.
*   If installed globally via the script, invoke it directly as `agentskills`.

### 2. Verify Config State
Before calling Vertex AI or the Gemini API, confirm the backend configuration is correct:
```bash
./bin/agentskills config show
```
*Expected default values:*
*   `backend`: `vertex`
*   `location`: `global`
*   `project_id`: your verified GCP Project ID

---

## 📂 Operational Workflows

### Crawl & Analyze Public Profiles
To compile an agent landscape, tech stack, and duplication analysis of a public GitHub profile:
```bash
# Saves output to a gitignored local markdown report
./bin/agentskills scan --github <target-username> -o ./reports/skills_report.md
```

### Scan Local Workspaces Recursively
To map and analyze local developer files on your computer recursively:
```bash
./bin/agentskills scan --local <path-to-directory> -o ./reports/local_skills_report.md
```

### Deep Codebase Analysis (Deep Scan)
To perform deep codebase analysis (cloning remote repositories or scanning local build files to extract file structures, project dependencies like `go.mod` or `package.json`, and sample scripts to enrich analysis):
```bash
./bin/agentskills scan --github <target-username> --deep -o ./reports/deep_skills_report.md
```

### Force Cache Refresh
To bypass local cached copies of `GEMINI.md` files (stored under `~/.cache/agentskills/`) and perform a fresh download from GitHub raw CDN:
```bash
./bin/agentskills scan --force-refresh
```

---

## ⚠️ Hygiene & Safety Gates

1.  **Never Check in Reports:** All generated reports (e.g. `skills_report.md` or files inside `./reports/`) are dynamically generated run outputs. **Do NOT commit them to Git.**
2.  **API Rate Limiting:** Avoid using `--force-refresh` repeatedly to prevent hitting public GitHub API endpoints. Leverage the default local XDG cache where possible.
3.  **ADC Validation:** If you encounter `credentials not found` or `404 Not Found` API errors, ensure that `gcloud auth application-default login` is valid and the `aiplatform.googleapis.com` service is fully enabled on the active Google Cloud project.
