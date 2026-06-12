# agentskills

`agentskills` scans, parses, and analyzes AI agent rule and workspace instruction files across local directories or GitHub repositories. It uses `gemini-3.5-flash` via Google Cloud Vertex AI or the Gemini API to find rule duplication (such as task tracking or session-ending workflows) and recommend consolidated agent skills.

## Supported Agent & Workspace Rule Formats

To accommodate diverse developer and agent orchestration standards, the CLI dynamically discovers and parses files for:
*   **Gemini**: `GEMINI.md`
*   **Claude**: `CLAUDE.md`
*   **OpenCode / Beads**: `AGENTS.md`
*   **Codex / Cursor**: `.cursorrules`, `.cursor/rules/*.mdc` (newer individual rule configurations), and `SYSTEM_PROMPT.md`

## Features

* **Scanning Modes**: Scan local directories recursively or crawl public repositories of a GitHub user to locate agent rule files.
* **Deep Codebase Scan (`--deep`)**: Shallow-clones remote repos or scans local folders to extract build settings (`Makefile`), dependencies (`go.mod`, `package.json`, `Cargo.toml`), and sample scripts to enrich analysis.
* **XDG Cache Support**: Caches fetched files under `~/.cache/agentskills/` to reduce API requests and support offline analysis.
* **SDK Integration**: Uses the official `google.golang.org/genai` Go SDK to run analysis via Vertex AI or the Gemini API.
* **Configuration Management**: Uses Cobra and Viper to manage settings in `~/.config/agentskills/config.yaml`.
* **Report Generation**: Produces a detailed markdown report detailing technologies, task tracking overlaps, and recommended agent skills.

## Installation

### Direct Download & Global Install (Recommended)

To install the latest pre-compiled binary globally:

```bash
curl -fsSL https://raw.githubusercontent.com/ghchinoy/agentskills/main/install.sh | bash
```

### Build from Source

Compile the binary using the provided `Makefile`:

```bash
make build
```

This compiles the binary to `./bin/agentskills`.

## Authentication & Configuration

The CLI supports both Vertex AI and the Gemini API.

### Vertex AI (Default)

1. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```

2. Configure Application Default Credentials (ADC):
   ```bash
   gcloud auth application-default login
   ```

3. Configure your GCP project ID and region:
   ```bash
   ./bin/agentskills config set project_id <your-gcp-project-id>
   ./bin/agentskills config set location global
   ```

### Gemini API

If you prefer to use the direct Gemini API:

1. Set your API key in the configuration:
   ```bash
   ./bin/agentskills config set backend gemini
   ./bin/agentskills config set api_key <your-api-key>
   ```

## Usage

### Scan a GitHub Profile (Standard Mode)

Scan all public repositories of a GitHub user for standard rule files:

```bash
./bin/agentskills scan --github <username> -o ./skills_report.md
```

### Scan with Deep Codebase Analysis (`--deep`)

Performs deep analysis on repositories by cloning/scanning project dependency manifests and sample files:

```bash
./bin/agentskills scan --github <username> --deep -o ./skills_report.md
```

### Scan a Local Directory

Scan a local path recursively:

```bash
./bin/agentskills scan --local /path/to/directory -o ./skills_report.md
```

### Force Cache Refresh

Bypass cached files and download fresh copies from GitHub:

```bash
./bin/agentskills scan --force-refresh
```

## Agent Skills & Documentation

* **[User's Guide](docs/users_guide.md)**: Standard configuration, backend pathways, and CLI options.
* **[Process & Architecture Log](docs/process.md)**: Development phases, engineering decisions, and codebase anatomy.
* **[Release Guide](docs/releasing.md)**: Workflows for semantic versioning, GoReleaser compilation, and packaging.
* **[agentskills Skill](skills/agentskills/SKILL.md)**: A spec-compliant [agent skills](https://agentskills.io/specification.md) file that teaches AI agents how to execute this tool.

---

This project tracks tasks and quality gates with Beads (`bd`).

