package scanner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ghchinoy/agentskills/internal/config"
)

// AgentFile represents an identified and loaded GEMINI.md file.
type AgentFile struct {
	Source  string `json:"source"`  // "local" or "github"
	Name    string `json:"name"`    // Repository or Directory name
	Path    string `json:"path"`    // Local filepath or GitHub URL
	Content string `json:"content"` // Raw file contents
}

// AgentFilenames defines the list of standard workspace-level agent rule files.
var AgentFilenames = []string{
	"GEMINI.md",
	"CLAUDE.md",
	"AGENTS.md",
	".cursorrules",
	"SYSTEM_PROMPT.md",
}

// LocalScanner recursively searches a local directory for agent rule files.
func LocalScanner(root string, deep bool) ([]AgentFile, error) {
	var files []AgentFile

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path of %q: %w", root, err)
	}

	err = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			name := d.Name()
			// Skip directories we know shouldn't contain project code or would be huge
			if name == ".git" || name == "node_modules" || name == ".beads" || name == "vendor" || name == "bin" || name == "dist" || name == "build" || name == ".gradle" || name == ".idea" {
				return filepath.SkipDir
			}
			return nil
		}

		var isAgentFile bool
		for _, filename := range AgentFilenames {
			if d.Name() == filename {
				isAgentFile = true
				break
			}
		}

		// Also support newer Cursor rules (.mdc files under .cursor/rules/)
		if !isAgentFile && strings.HasSuffix(d.Name(), ".mdc") && strings.Contains(filepath.ToSlash(path), ".cursor/rules") {
			isAgentFile = true
		}

		if isAgentFile {
			content, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("failed to read file %s: %w", path, err)
			}

			dirName := filepath.Base(filepath.Dir(path))
			filename := d.Name()
			fileContent := string(content)

			if deep {
				fileContent += extractSupplementaryContext(filepath.Dir(path))
			}

			files = append(files, AgentFile{
				Source:  "local",
				Name:    fmt.Sprintf("%s (%s)", dirName, filename),
				Path:    path,
				Content: fileContent,
			})
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return files, nil
}

// GitHubRepo represents a repository returned by the GitHub API.
type GitHubRepo struct {
	Name      string `json:"name"`
	UpdatedAt string `json:"updated_at"`
}

// GitHubScanner fetches agent rule files from all active public repositories of a given user.
func GitHubScanner(username string, forceRefresh bool, deep bool) ([]AgentFile, error) {
	var files []AgentFile

	cacheDir, err := config.GetCacheDir()
	if err != nil {
		return nil, fmt.Errorf("failed to resolve cache directory: %w", err)
	}

	userCacheDir := filepath.Join(cacheDir, "github", username)
	if err := os.MkdirAll(userCacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %w", err)
	}

	// 1. Fetch public repositories of the user
	repos, err := fetchGitHubRepos(username)
	if err != nil {
		// If offline or rate limited, let's see if we can use cached files
		fmt.Printf("⚠ Warning: failed to fetch repository list from GitHub (%s). Falling back to local cache...\n", err)
		return loadFromCache(userCacheDir)
	}

	fmt.Printf("Discovered %d public repositories for user: %s\n", len(repos), username)

	// 2. Fetch agent files for each repository (using cache where possible)
	for _, repo := range repos {
		var foundFiles []struct {
			filename string
			content  string
		}

		for _, filename := range AgentFilenames {
			cachePath := filepath.Join(userCacheDir, fmt.Sprintf("%s_%s", repo.Name, filename))
			var hasFile bool
			var fileContent string

			// Check cache
			if !forceRefresh {
				if data, err := os.ReadFile(cachePath); err == nil {
					hasFile = true
					fileContent = string(data)
				}
			}

			if !hasFile {
				// Download from GitHub
				content, found, err := downloadAgentFile(username, repo.Name, filename)
				if err != nil {
					continue
				}

				if found {
					hasFile = true
					fileContent = content
					// Write to cache
					_ = os.WriteFile(cachePath, []byte(content), 0644)
				}
			}

			if hasFile {
				foundFiles = append(foundFiles, struct {
					filename string
					content  string
				}{filename: filename, content: fileContent})
			}
		}

		if len(foundFiles) > 0 {
			var supplementaryContext string
			// If deep is true, we clone the repository exactly once to extract metadata
			if deep {
				fmt.Printf("Performing deep checkout for %s/%s...\n", username, repo.Name)
				tempDir, err := os.MkdirTemp("", fmt.Sprintf("agentskills-clone-%s-*", repo.Name))
				if err == nil {
					cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", username, repo.Name)
					cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, tempDir)
					if err := cmd.Run(); err == nil {
						supplementaryContext = extractSupplementaryContext(tempDir)
					} else {
						fmt.Printf("  ⚠ Warning: failed to clone repository %s: %v\n", repo.Name, err)
					}
					// Always clean up tempDir
					_ = os.RemoveAll(tempDir)
				} else {
					fmt.Printf("  ⚠ Warning: failed to create temporary directory for clone: %v\n", err)
				}
			}

			for _, f := range foundFiles {
				files = append(files, AgentFile{
					Source:  "github",
					Name:    fmt.Sprintf("%s (%s)", repo.Name, f.filename),
					Path:    fmt.Sprintf("https://github.com/%s/%s/blob/main/%s", username, repo.Name, f.filename),
					Content: f.content + supplementaryContext,
				})
			}
		}
	}

	return files, nil
}

func fetchGitHubRepos(username string) ([]GitHubRepo, error) {
	var allRepos []GitHubRepo
	page := 1

	for {
		url := fmt.Sprintf("https://api.github.com/users/%s/repos?per_page=100&page=%d", username, page)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "agentskills-cli")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("user %q not found on GitHub", username)
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("GitHub API returned status %d: %s", resp.StatusCode, string(body))
		}

		var repos []GitHubRepo
		if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
			return nil, err
		}

		if len(repos) == 0 {
			break
		}

		allRepos = append(allRepos, repos...)
		page++
	}

	return allRepos, nil
}

func downloadAgentFile(username, repo, filename string) (string, bool, error) {
	branches := []string{"main", "master"}

	for _, branch := range branches {
		url := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", username, repo, branch, filename)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return "", false, err
		}
		req.Header.Set("User-Agent", "agentskills-cli")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", false, err
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode == http.StatusOK {
			data, err := io.ReadAll(resp.Body)
			if err != nil {
				return "", false, err
			}
			return string(data), true, nil
		}
		if resp.StatusCode == http.StatusNotFound {
			continue // Try next branch
		}
		return "", false, fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	return "", false, nil // File not found in any standard branch
}

func loadFromCache(userCacheDir string) ([]AgentFile, error) {
	var files []AgentFile

	entries, err := os.ReadDir(userCacheDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		var matchedFilename string
		for _, filename := range AgentFilenames {
			suffix := "_" + filename
			if strings.HasSuffix(entry.Name(), suffix) {
				matchedFilename = filename
				break
			}
		}

		if matchedFilename == "" {
			continue
		}

		suffix := "_" + matchedFilename
		repoName := strings.TrimSuffix(entry.Name(), suffix)
		path := filepath.Join(userCacheDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		files = append(files, AgentFile{
			Source:  "github",
			Name:    fmt.Sprintf("%s (%s)", repoName, matchedFilename),
			Path:    path,
			Content: string(data),
		})
	}

	return files, nil
}

// extractSupplementaryContext extracts directory structures, Makefiles, package dependencies,
// and sample scripts to enrich AgentFile analysis context.
func extractSupplementaryContext(root string) string {
	var sb strings.Builder
	sb.WriteString("\n\n---\n## Supplementary Codebase Context (Deep Scan)\n\n")

	// 1. Directory list (top-level and 1-level deep)
	sb.WriteString("### Directory Structure:\n")
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, entry := range entries {
			name := entry.Name()
			if name == ".git" || name == ".beads" || name == "node_modules" || name == "vendor" {
				continue
			}
			if entry.IsDir() {
				fmt.Fprintf(&sb, "- %s/\n", name)
				subEntries, err := os.ReadDir(filepath.Join(root, name))
				if err == nil {
					for idx, sub := range subEntries {
						if idx >= 5 {
							fmt.Fprintf(&sb, "  - ... (%d more files)\n", len(subEntries)-5)
							break
						}
						fmt.Fprintf(&sb, "  - %s/%s\n", name, sub.Name())
					}
				}
			} else {
				fmt.Fprintf(&sb, "- %s\n", name)
			}
		}
	}
	sb.WriteString("\n")

	// 2. Build files (Makefile or taskfile)
	makefiles := []string{"Makefile", "makefile", "taskfile.yaml", "taskfile.yml"}
	for _, mf := range makefiles {
		p := filepath.Join(root, mf)
		if data, err := os.ReadFile(p); err == nil {
			fmt.Fprintf(&sb, "### Build Configuration (%s):\n```\n", mf)
			lines := strings.Split(string(data), "\n")
			if len(lines) > 80 {
				sb.WriteString(strings.Join(lines[:80], "\n"))
				sb.WriteString("\n... (truncated)\n")
			} else {
				sb.WriteString(string(data))
			}
			sb.WriteString("\n```\n\n")
			break
		}
	}

	// 3. Package/Dependency files
	depFiles := []string{"go.mod", "package.json", "Cargo.toml", "requirements.txt", "Gemfile"}
	for _, df := range depFiles {
		p := filepath.Join(root, df)
		if data, err := os.ReadFile(p); err == nil {
			fmt.Fprintf(&sb, "### Project Dependencies (%s):\n```json\n", df)
			lines := strings.Split(string(data), "\n")
			if len(lines) > 80 {
				sb.WriteString(strings.Join(lines[:80], "\n"))
				sb.WriteString("\n... (truncated)\n")
			} else {
				sb.WriteString(string(data))
			}
			sb.WriteString("\n```\n\n")
		}
	}

	// 4. Sample Scripts
	scriptDirs := []string{"scripts", "bin", "tools"}
	for _, sd := range scriptDirs {
		dirPath := filepath.Join(root, sd)
		if info, err := os.Stat(dirPath); err == nil && info.IsDir() {
			sEntries, err := os.ReadDir(dirPath)
			if err == nil {
				for _, se := range sEntries {
					if !se.IsDir() && (strings.HasSuffix(se.Name(), ".sh") || strings.HasSuffix(se.Name(), ".py") || strings.HasSuffix(se.Name(), ".go")) {
						scriptPath := filepath.Join(dirPath, se.Name())
						if sData, err := os.ReadFile(scriptPath); err == nil {
							fmt.Fprintf(&sb, "### Sample Script (%s/%s):\n```bash\n", sd, se.Name())
							lines := strings.Split(string(sData), "\n")
							if len(lines) > 80 {
								sb.WriteString(strings.Join(lines[:80], "\n"))
								sb.WriteString("\n... (truncated)\n")
							} else {
								sb.WriteString(string(sData))
							}
							sb.WriteString("\n```\n\n")
							break
						}
					}
				}
			}
		}
	}

	return sb.String()
}
