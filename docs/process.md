# Project Creation & Architecture Log 🛠️

This document details the engineering lifecycle, design decisions, architectural patterns, and solutions to technical challenges encountered during the creation of **`agentskills`**.

---

## 📅 Phase 1: Project Framing & Setup

### Requirements Definition
Our primary objective was to build a clean, high-performance Go-based CLI tool to help a developer analyze workspace rule documents (`GEMINI.md`) across their repository landscape. The tool needed to:
1. Scan local directories recursively or public GitHub profiles cleanly.
2. Store configuration and caches securely following local operating system standards.
3. Integrate seamlessly with the brand-new, official unified Google GenAI SDK (`google.golang.org/genai`).
4. Invoke `gemini-3.5-flash` to consolidate, group, and structure developer capabilities into clean, reusable modular prompts and MCP servers.

### Task-Level Hygiene & Tracking
To enforce production-grade development standards, we integrated **Beads (`bd`)** and Dolt directly into the workflow:
*   Initialized a local beads tracker inside `~/projects/agentskills/.beads/`.
*   Created Epic `agentskills-cnl` ("Create Go Agent Skills Tool") and tracked development across 5 atomic sub-tasks.
*   Managed task state transitions (`bd update <task> --claim`, `bd close <task>`) dynamically as features compiled and qualified.

---

## 📂 Phase 2: Configuration & XDG Standards

To support a seamless, native command line experience, we established configuration standards leveraging **Cobra** and **Viper**:
*   **XDG Base Directory Specification Conformance:**
    *   **Configuration Path:** Config values (backend, location, project ID, GitHub user, and direct API keys) are persisted to `~/.config/agentskills/config.yaml`.
    *   **Cache Path:** To prevent heavy GitHub API request throttling, discovered files are cached recursively inside `~/.cache/agentskills/github/<user>/`.
*   **Viper Bindings:** Config fields bind dynamically to environment variables (prefixed with `AGENTSKILLS_`) as well as Cobra command flags.

---

## 🔍 Phase 3: Crawling & Caching Engines

The scanning mechanics are split into two clean interfaces inside `internal/scanner/scanner.go`:

### 1. The Local Recursion Scanner
*   Recursively walks any arbitrary local path using `filepath.WalkDir`.
*   Bypasses noisy, unrelated, or heavy folders (`.git`, `node_modules`, `vendor`, `.beads`, `bin`, `dist`) to ensure fast traversal.
*   Loads and packages `GEMINI.md` files into a slice of `AgentFile` structs.

### 2. The GitHub Profile Crawler
*   Queries public GitHub repositories for a given user using page-buffered API calls.
*   Resolves file availability over the standard raw CDN:
    `https://raw.githubusercontent.com/<user>/<repo>/<branch>/GEMINI.md`
    checking both `main` and `master` branches.
*   Saves downloads inside the local XDG cache. Subsequent calls instantly load from the local cache file (`<repo>_GEMINI.md`), ensuring rapid execution speeds.

---

## 🤖 Phase 4: Unified GenAI SDK Integration

We integrated the official, brand-new Google GenAI SDK (`google.golang.org/genai`), which unifies Vertex AI and the Gemini Developer API under a central client interface:

### 1. Technical SDK Lessons Learned
*   **Unified Client:** Instantiated via `genai.NewClient(ctx, clientConfig)`.
*   **Backend Selection:** Uses `genai.BackendVertexAI` or `genai.BackendGeminiAPI` based on client configuration, ensuring compatibility across environments.
*   **Text Extraction Method:** The SDK returns completions where text is extracted using the `.Text()` method (as a function call: `resp.Text()`), rather than accessing a raw struct field (`resp.Candidates[0]...`).

### 2. Prompt Engineering & Backtick Workaround
*   Go raw string literals (`` ` ``) cannot contain raw backticks, even if escaped.
*   To ask Gemini to output beautiful Markdown without wrapping the final document inside redundant outermost triple-backticks, we structured the prompt instructions using explicit text descriptions ("triple backticks") rather than embedding raw literal fences inside the Go source code.

---

## ⚡ Phase 5: Live Debugging & GCP Operations

During verification and dry-runs on the user's 246 repositories, we encountered and successfully resolved several real-world cloud deployment hurdles:

### 1. Application Default Credentials (ADC) Setup
*   The Go SDK uses Google Cloud ADC to authenticate requests on Vertex AI.
*   *Solution:* Guided the user to authenticate locally by running `gcloud auth application-default login`, generating a valid OAuth token flow and creating local ADC credentials files.

### 2. Service Activation
*   Newly authenticated developer environments may lack active Vertex AI APIs.
*   *Solution:* Executed `gcloud services enable aiplatform.googleapis.com --project=generative-bazaar-001` to authorize the AI platform engine.

### 3. Region Availability and "Global" Endpoint
*   *Hurdle:* Target-region endpoints (e.g. `us-central1`) threw 404s for the brand-new model `gemini-3.5-flash` because newer stable models are serving-restricted.
*   *Solution:* Switched the CLI location config to `global` (`./bin/agentskills config set location global`). The global endpoint correctly resolved, routed, and returned our analysis in under 15 seconds.

### 4. Build and Hygiene Automation
*   We removed all root-level binary files and deployed a clean `Makefile` to target `./bin/` outputs.
*   Updated `.gitignore` rules to ensure that compiled artifacts remain strictly separated from the repository source history.

---

## 🛠️ Phase 6: Programmatic JSON Output & Safety Gates
*   **JSON Output Mode (`--json`):** Formats analysis output as structured JSON written to `stdout`. Progress indicators are routed to `os.Stderr` to avoid polluting programmatic data pipelines.
*   **Scale Safety Gate:** Scans are limited to 10 rule files by default to protect the LLM context window and prevent 429 rate limits, with a `--force-scan` flag added for explicit bypasses.

---

## 🗄️ Phase 7: Persistent Discovered Skills Catalog
*   **Catalog Database:** Creates a local database at `~/.config/agentskills/catalog.json` using XDG specifications.
*   **Upsert & Merging Logic:** When a scan finishes, unique skills are extracted from the structured LLM analysis, merged with existing catalog entries (deduplicating capabilities and aggregating sources), and saved.
*   **Catalog Querying:** Added the `agentskills catalog` command to view or output the catalog as raw JSON for consuming agents.

---

## 📂 Phase 8: Progressive Disclosure Spec Alignment
*   **Agent Skills Spec Alignment:** Refactored prompts in `internal/ai/analysis.go` to explicitly check discovered rule files against the `agentskills.io` size guidelines (instructions under 5,000 tokens / 500 lines).
*   **Directory Split Recommendations:** Scans now recommend splitting rules into `scripts/`, `references/`, or `assets/` subfolders if they contain long inline scripts, dense tables, or secondary documentation.
