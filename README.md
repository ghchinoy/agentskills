# agentskills

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/github/go-mod/go-version/ghchinoy/agentskills)](go.mod)

`agentskills` scans, parses, and analyzes AI agent rule and workspace instruction files across local directories or GitHub repositories. It uses Gemini via Google Cloud Vertex AI or the Gemini API to detect rule duplication across projects and recommend consolidated, reusable [agent skills](https://agentskills.io/specification.md).

## Installation

### Quick Install (Recommended)

Install the latest pre-compiled binary:

```bash
curl -fsSL https://raw.githubusercontent.com/ghchinoy/agentskills/main/install.sh | bash
```

### Via Go

```bash
go install github.com/ghchinoy/agentskills@latest
```

## Quick Start

Scan your current project directory:

```bash
agentskills scan --local .
```

Scan all public repositories of a GitHub user:

```bash
agentskills scan --github <username> -o ./skills_report.md
```

## Supported Rule Formats

`agentskills` dynamically discovers and parses rule files across major agent and IDE orchestration formats:

* **Gemini:** `GEMINI.md`
* **Claude:** `CLAUDE.md`
* **OpenCode / Beads:** `AGENTS.md`
* **Codex / Cursor:** `.cursorrules`, `.cursor/rules/*.mdc`, and `SYSTEM_PROMPT.md`

## Key Features

* **Dual Scanning Modes:** Recursively scan local directory trees or crawl public GitHub repositories.
* **Deep Codebase Inspection (`--deep`):** Inspects build files (`Makefile`), package manifests (`go.mod`, `package.json`, `Cargo.toml`), and scripts to enrich skill recommendations.
* **Persistent Discovered Skills Catalog:** Maintains a local database (`~/.config/agentskills/catalog.json`) of unique discovered capabilities that can be queried offline without making new AI API calls.
* **Progressive Disclosure Spec Alignment:** Evaluates rule files against size limits in the [Agent Skills Specification](https://agentskills.io/specification.md) and suggests modularizing large rules into `scripts/`, `references/`, or `assets/` subfolders.
* **Programmatic JSON Output (`--json`):** Streams structured JSON to `stdout` while routing logs to `stderr` for clean pipeline integration (`jq`).
* **Scale Safety Gate:** Prevents unintended API rate-limiting by warning and halting on scans with more than 10 rule files unless bypassed with `--force-scan`.
* **XDG Compliant Caching:** Caches remote repositories under `~/.cache/agentskills/` to minimize network traffic and enable offline re-analysis.

## Authentication & Setup

`agentskills` supports both Google Cloud Vertex AI (default) and Google AI Studio Gemini API.

### Vertex AI (Default)

1. Authenticate with Google Cloud Application Default Credentials (ADC):
   ```bash
   gcloud auth application-default login
   ```
2. (Optional) Set your active GCP project ID and region:
   ```bash
   agentskills config set project_id <your-gcp-project-id>
   agentskills config set location global
   ```

### Gemini API (API Key)

```bash
agentskills config set backend gemini
agentskills config set api_key <your-api-key>
# Or via environment variable: export GEMINI_API_KEY="your-key"
```

For full configuration options, see the [User's Guide](docs/users_guide.md).

## Usage Examples

### Scan with Programmatic JSON Output

```bash
agentskills scan --local . --json -o ./reports/my_report.md
```

### Query the Discovered Skills Catalog

```bash
# View formatted summary of discovered skills
agentskills catalog

# Output raw catalog JSON
agentskills catalog --json
```

### Bypass Scale Safety Gate

```bash
agentskills scan --local /path/to/large/workspace --force-scan
```

### Force Cache Refresh

```bash
agentskills scan --force-refresh
```

## Documentation

* **[User's Guide](docs/users_guide.md)**: Detailed configuration, backend routing, flags, and scan options.
* **[Development Guide](docs/development.md)**: Local build instructions, testing, codebase anatomy, and Beads (`bd`) task tracking.
* **[Architecture & Process Log](docs/process.md)**: Engineering lifecycle, design choices, and technical milestone logs.
* **[Release Engineering Guide](docs/releasing.md)**: Semantic versioning, GoReleaser workflows, and distribution steps.
* **[Agent Skill Definition](skills/agentskills/SKILL.md)**: Spec-compliant skill file teaching AI agents how to operate `agentskills`.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request. For local setup and development instructions, see the [Development Guide](docs/development.md).

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
