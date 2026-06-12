# Workspace Rules: cloud-interactions-go

This file defines strict rules, quality gates, and release guidelines for AI assistants working on the `cloud-interactions-go` library.

---

## 1. Quality Gates (Mandatory Verification)

Before proposing or applying any code modifications, you MUST verify the codebase:

*   **Build Verification**: Always run `go build ./...` from the project root to ensure all files compile without errors.
*   **Testing**: Run `go test -race ./...` to ensure no regressions are introduced and there are no race conditions.
*   **Linting Compliance**: If `golangci-lint` is configured or installed, run it (`golangci-lint run`) to verify static analysis rules.

---

## 2. Design Principles for a Go Library

*   **Backwards Compatibility**: Because this is a library consumed by external users, never introduce breaking changes to the exported public API (methods, structs, signatures) within the `v1` version boundary.
*   **Dependency Minimality**: Keep third-party dependencies to a minimum to prevent dependency bloat for downstream consumers.
*   **Correct Package Import**: When using Google's generative AI package for Go, use `google.golang.org/genai` (imported as `import "google.golang.org/genai"`). Do not use `cloud.google.com/go/vertexai/genai`.

---

## 3. Versioning & Release Workflow

When releasing a new version or updating the library, follow these steps:

1.  **Determine the Version Bump**:
    *   **PATCH** (`v1.0.x`): Bug fixes only.
    *   **MINOR** (`v1.x.0`): New backward-compatible features (new methods, struct additions).
    *   **MAJOR** (`v2.0.0`): Backward-incompatible changes. *Requires updating the module path in `go.mod` to include the `/v2` suffix.*
2.  **Git Tagging**:
    *   Instruct the user to tag the repository matching the SemVer format:
        ```bash
        git tag v1.0.0
        git push origin v1.0.0
        ```
