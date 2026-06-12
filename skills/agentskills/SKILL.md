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

## 🛠️ Execution & Commands

### 1. Locate the Binary
*   Always compile the latest state inside the repository directory using `make build`.
*   Always invoke the compiled binary using its local directory path: `./bin/agentskills`.

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
