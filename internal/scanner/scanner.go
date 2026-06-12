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

	"agentskills/internal/config"
)

// AgentFile represents an identified and loaded GEMINI.md file.
type AgentFile struct {
	Source  string `json:"source"`  // "local" or "github"
	Name    string `json:"name"`    // Repository or Directory name
	Path    string `json:"path"`    // Local filepath or GitHub URL
	Content string `json:"content"` // Raw file contents
}

// LocalScanner recursively searches a local directory for GEMINI.md files.
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

		if d.Name() == "GEMINI.md" {
			content, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("failed to read file %s: %w", path, err)
			}

			dirName := filepath.Base(filepath.Dir(path))
			fileContent := string(content)

			if deep {
				fileContent += extractSupplementaryContext(filepath.Dir(path))
			}

			files = append(files, AgentFile{
				Source:  "local",
				Name:    dirName,
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

// GitHubScanner fetches GEMINI.md files from all active public repositories of a given user.
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

	// 2. Fetch GEMINI.md for each repository (using cache where possible)
	for _, repo := range repos {
		cachePath := filepath.Join(userCacheDir, fmt.Sprintf("%s_GEMINI.md", repo.Name))
		var hasGemini bool
		var geminiContent string

		// Check cache
		if !forceRefresh {
			if data, err := os.ReadFile(cachePath); err == nil {
				hasGemini = true
				geminiContent = string(data)
			}
		}

		if !hasGemini {
			// Download from GitHub
			fmt.Printf("Fetching GEMINI.md for %s/%s...\n", username, repo.Name)
			content, found, err := downloadGEMINI(username, repo.Name)
			if err != nil {
				fmt.Printf("  ⚠ Error downloading for %s: %v\n", repo.Name, err)
				continue
			}

			if found {
				hasGemini = true
				geminiContent = content
				// Write to cache
				if err := os.WriteFile(cachePath, []byte(content), 0644); err != nil {
					fmt.Printf("  ⚠ Warning: failed to cache GEMINI.md for %s: %v\n", repo.Name, err)
				}
			}
		}

		if hasGemini {
			// If deep is true, we clone the repository and extract metadata
			if deep {
				fmt.Printf("Performing deep checkout for %s/%s...\n", username, repo.Name)
				tempDir, err := os.MkdirTemp("", fmt.Sprintf("agentskills-clone-%s-*", repo.Name))
				if err == nil {
					cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", username, repo.Name)
					cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, tempDir)
					if err := cmd.Run(); err == nil {
						// Extract supplementary context from the cloned directory
						geminiContent += extractSupplementaryContext(tempDir)
					} else {
						fmt.Printf("  ⚠ Warning: failed to clone repository %s: %v\n", repo.Name, err)
					}
					// Always clean up tempDir
					os.RemoveAll(tempDir)
				} else {
					fmt.Printf("  ⚠ Warning: failed to create temporary directory for clone: %v\n", err)
				}
			}

			files = append(files, AgentFile{
				Source:  "github",
				Name:    repo.Name,
				Path:    fmt.Sprintf("https://github.com/%s/%s/blob/main/GEMINI.md", username, repo.Name),
				Content: geminiContent,
			})
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
		defer resp.Body.Close()

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

func downloadGEMINI(username, repo string) (string, bool, error) {
	branches := []string{"main", "master"}

	for _, branch := range branches {
		url := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/GEMINI.md", username, repo, branch)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return "", false, err
		}
		req.Header.Set("User-Agent", "agentskills-cli")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", false, err
		}
		defer resp.Body.Close()

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
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), "_GEMINI.md") {
			continue
		}

		repoName := strings.TrimSuffix(entry.Name(), "_GEMINI.md")
		path := filepath.Join(userCacheDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		files = append(files, AgentFile{
			Source:  "github",
			Name:    repoName,
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
				sb.WriteString(fmt.Sprintf("- %s/\n", name))
				subEntries, err := os.ReadDir(filepath.Join(root, name))
				if err == nil {
					for idx, sub := range subEntries {
						if idx >= 5 {
							sb.WriteString(fmt.Sprintf("  - ... (%d more files)\n", len(subEntries)-5))
							break
						}
						sb.WriteString(fmt.Sprintf("  - %s/%s\n", name, sub.Name()))
					}
				}
			} else {
				sb.WriteString(fmt.Sprintf("- %s\n", name))
			}
		}
	}
	sb.WriteString("\n")

	// 2. Build files (Makefile or taskfile)
	makefiles := []string{"Makefile", "makefile", "taskfile.yaml", "taskfile.yml"}
	for _, mf := range makefiles {
		p := filepath.Join(root, mf)
		if data, err := os.ReadFile(p); err == nil {
			sb.WriteString(fmt.Sprintf("### Build Configuration (%s):\n```\n", mf))
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
			sb.WriteString(fmt.Sprintf("### Project Dependencies (%s):\n```json\n", df))
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
							sb.WriteString(fmt.Sprintf("### Sample Script (%s/%s):\n```bash\n", sd, se.Name()))
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
