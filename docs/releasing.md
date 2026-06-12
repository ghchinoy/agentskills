# Release Engineering Guide 🚀

This document describes the release engineering standards and step-by-step procedures for compiling, tagging, and distributing new versions of the **`agentskills`** CLI tool using **GoReleaser**.

---

## 📐 Semantic Versioning (SemVer)
We conform to **Semantic Versioning 2.0.0** (`vMAJOR.MINOR.PATCH`):
*   **MAJOR version:** Incompatible API changes or complete command rewrites.
*   **MINOR version:** New backward-compatible functionality (e.g. adding scanner backends, new report filters, or diagnostic commands).
*   **PATCH version:** Backward-compatible bug fixes or minor cache optimization adjustments.

---

## ⚙️ Prerequisites for Releases
To compile and publish a production release, the release engineer must have:
1.  **GoReleaser installed:** Installation on Debian/Ubuntu:
    ```bash
    sudo apt-get install goreleaser
    ```
2.  **GitHub Access Token:** A personal access token (PAT) with `repo` scope is required so GoReleaser can push release archives, changelogs, and checksums. Export it globally before releasing:
    ```bash
    export GITHUB_TOKEN="your_github_personal_access_token"
    ```

---

## 🛠️ Step-by-Step Release Workflow

Follow these steps precisely to release a new version of `agentskills`.

### 1. Conform to Quality Gates
Ensure all tests and linters pass cleanly before tagging any release:
```bash
make test
make lint
```

### 2. Verify beads Issue Tracking States
Verify that the current version's corresponding epic and task beads are completed and closed:
```bash
bd list
```

### 3. Verify GoReleaser Configuration Locally
Dry-run the compilation pipeline locally to ensure that `.goreleaser.yaml` is valid and the project builds cleanly for cross-platform targets (without publishing to GitHub):
```bash
goreleaser release --snapshot --clean
```
*   This places temporary test compilation files inside the `./dist/` directory.
*   Check that binaries for macOS, Linux, and Windows are built successfully.

### 4. Create and Push the Semantic Git Tag
Tag the head of the `main` branch with the target version. Be sure to write a clear, descriptive message listing the prominent additions:
```bash
# Example tag creation for version v1.0.0
git tag -a v1.0.0 -m "Release v1.0.0: Initial stable release with XDG caching and Vertex AI backend support"

# Push the tag to your remote GitHub origin
git push origin v1.0.0
```

### 5. Execute GoReleaser to Publish the Release
Now, run the release command *without* the `--snapshot` flag to trigger full cross-platform builds, automatic changelog generation, and immediate publication to GitHub Releases:
```bash
# Ensure GITHUB_TOKEN is set in your active environment
goreleaser release --clean
```

---

## 🛡️ Post-Release Checklist

1.  **Verify GitHub Releases Page:** Visit `https://github.com/ghchinoy/agentskills/releases` and verify that:
    *   The `v1.0.0` tag was successfully converted into a formal Release.
    *   The compiled archives (e.g. `.tar.gz` and `.zip` packages for various CPU architectures and OS types) and `checksums.txt` files are fully attached.
2.  **Verify the `curl` installer:** Run your `curl` installer locally on a blank container or sandbox to ensure it correctly grabs the latest tagged version and unpacks the binary and spec-compliant skill directories.
