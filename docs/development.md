# Development Guide 🛠️

This document outlines the development workflow, local setup instructions, testing practices, and task tracking conventions for contributors to **`agentskills`**.

---

## 📋 Prerequisites

* **Go Runtime:** Go 1.26.4+ installed and available on your `$PATH` — the version
  `go.mod` declares. An older toolchain is refused (`go.mod requires go >= 1.26.4`)
  unless `GOTOOLCHAIN` is left at its default `auto`, which downloads it on demand.
* **Google Cloud SDK:** `gcloud` CLI installed with Application Default Credentials configured (for Vertex AI testing).
* **Beads (`bd`):** Used for internal task tracking and quality gates.
* **GolangCI-Lint:** (Optional, for linting) `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`.

---

## 🚀 Local Setup & Build

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ghchinoy/agentskills.git
   cd agentskills
   ```

2. **Download dependencies:**
   ```bash
   go mod download
   ```

3. **Build the binary:**
   ```bash
   make build
   ```
   The compiled binary will be placed at `./bin/agentskills`.

4. **Verify the build:**
   ```bash
   ./bin/agentskills --help
   ```

---

## 🧪 Testing & Quality Gates

Before submitting changes or opening a pull request, ensure all tests and linters pass:

```bash
# Run unit tests
make test

# Run linter
make lint

# Clean build artifacts
make clean
```

---

## 🧭 Project Architecture

```
agentskills/
├── cmd/               # CLI commands (Cobra / Viper definitions)
│   ├── root.go        # Base command, global flags, and banner
│   ├── scan.go        # Scanning engine command (--local, --github, --deep, --json)
│   ├── catalog.go     # Skills catalog viewer (--json)
│   └── config.go      # Configuration management (show, set)
├── internal/
│   ├── ai/            # Google GenAI SDK integration (Vertex AI & Gemini API)
│   ├── catalog/       # Local database management (~/.config/agentskills/catalog.json)
│   ├── config/        # XDG configuration loading & Viper bindings
│   ├── git/           # GitHub repository crawling & shallow cloning
│   └── scanner/       # Local filesystem directory recursion & rule discovery
├── docs/              # In-depth technical guides & user documentation
├── skills/            # Spec-compliant agent skills definitions
└── main.go            # Entrypoint
```

---

## 📊 Task & Issue Tracking with Beads (`bd`)

This project uses **Beads (`bd`)** backed by Dolt for durable task tracking, blocker management, and session transitions.

### Common Beads Commands

```bash
# Find ready tasks to work on
bd ready

# View task details
bd show <id>

# Claim a task atomically
bd update <id> --claim

# Complete a task
bd close <id>

# Check database and integration health
bd doctor
```

For more details on architectural design choices and phase history, see [docs/process.md](process.md). For release workflows and semantic versioning, see [docs/releasing.md](releasing.md).
