# User's Guide: agentskills 📖

Welcome to the **`agentskills`** user manual. This guide outlines everything you need to build, configure, authorize, and run the tools to scan and analyze agent rule files.

---

## 📋 Prerequisites

Before using `agentskills`, ensure your system meets the following requirements:
*   **Go Runtime:** Go 1.22 or higher installed and added to your `$PATH`.
*   **Google Cloud SDK (For Vertex AI Backend):** The `gcloud` command line interface installed.
*   **GitHub Access:** Public repositories containing a `GEMINI.md` file in their root directories (or matching local files).

---

## 🛠️ Building & Installing

### Global Installation (Recommended)

To install the latest pre-compiled binary globally:
```bash
curl -fsSL https://raw.githubusercontent.com/ghchinoy/agentskills/main/install.sh | bash
```

Alternatively, if you have Go installed on your system, you can compile and install `agentskills` directly from source:
```bash
go install github.com/ghchinoy/agentskills@latest
```

### Build from Source

We provide a standard `Makefile` to automate compilation:

#### Build the Binary
This compiles the application and outputs the binary inside the `./bin/` directory:
```bash
make build
```

### Clean Up Build Artifacts
To wipe compiled binaries and start fresh:
```bash
make clean
```

### Run Tests and Linters
Verify code correctness and adhere to coding gates:
```bash
make test
make lint
```

---

## ⚙️ Configuration

`agentskills` conforms to the **XDG Base Directory Specification**, which separates runtime configurations and heavy cache stores on your operating system:

*   **Config File:** `~/.config/agentskills/config.yaml`
*   **Cache Directory:** `~/.cache/agentskills/`

### Viewing Configuration
To display your active workspace parameters, run:
```bash
./bin/agentskills config show
```

### Modifying Configuration
You can set configuration keys globally using the CLI:
```bash
# Set your active Google Cloud Project ID
./bin/agentskills config set project_id <your-gcp-project-id>

# Set your target generative backend (vertex or gemini)
./bin/agentskills config set backend vertex

# Set the serving endpoint location
./bin/agentskills config set location global

# Set your default target GitHub username
./bin/agentskills config set github_user ghchinoy
```

---

## 🔑 Authentication

`agentskills` supports two generative AI backend pathways depending on your credentials:

### 1. Vertex AI Backend (Recommended / Default)
This backend routes prompts through enterprise Google Cloud Vertex AI infrastructure.

1.  **Authorize your personal SDK profile:**
    ```bash
    gcloud auth login
    ```
2.  **Generate local Application Default Credentials (ADC) files:**
    This allows the unified Go GenAI SDK to discover your authentication token:
    ```bash
    gcloud auth application-default login
    ```
3.  **Ensure Vertex AI API is enabled on your target project:**
    ```bash
    gcloud services enable aiplatform.googleapis.com --project=<your-project-id>
    ```
4.  **Configure the CLI:**
    ```bash
    ./bin/agentskills config set project_id <your-project-id>
    ./bin/agentskills config set location global
    ./bin/agentskills config set backend vertex
    ```

### 2. Direct Gemini API Backend
This backend targets the direct Google AI Studio developer API endpoints.

1.  **Obtain a Gemini API key** from Google AI Studio.
2.  **Configure the key inside the configuration file:**
    ```bash
    ./bin/agentskills config set backend gemini
    ./bin/agentskills config set api_key <your-api-key>
    ```
    *Alternatively, you can export the key as an environment variable:*
    ```bash
    export GEMINI_API_KEY="AIzaSy..."
    ```

---

## 🚀 Running the Scan

The `scan` command runs file discovery, caches downloads locally, and generates the Markdown report.

### 1. Scan your GitHub Profile (using Config Defaults)
If you have set `github_user` in your config file, you can run the scan directly:
```bash
./bin/agentskills scan
```

### 2. Scan a Specific GitHub User
To override the default config and crawl a different public profile:
```bash
./bin/agentskills scan --github <another-username>
```

### 3. Scan a Local Directory Recursively
To parse workspace rules on your local drive (such as your projects workspace folder):
```bash
./bin/agentskills scan --local /home/user/projects
```

### 4. Customizing the Output Report Path
By default, the report writes to `./skills_report.md`. To direct the final Markdown to a custom path:
```bash
./bin/agentskills scan -o /path/to/custom_report.md
```

### 5. Forcing Cache Refresh
If you have recently added or edited a `GEMINI.md` file in one of your online repositories and want the scanner to bypass local XDG cache files and fetch fresh copies from GitHub raw CDN:
```bash
./bin/agentskills scan --force-refresh
```
