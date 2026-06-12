package scanner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
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
func LocalScanner(root string) ([]AgentFile, error) {
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
			files = append(files, AgentFile{
				Source:  "local",
				Name:    dirName,
				Path:    path,
				Content: string(content),
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
func GitHubScanner(username string, forceRefresh bool) ([]AgentFile, error) {
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

		// Check cache
		if !forceRefresh {
			if data, err := os.ReadFile(cachePath); err == nil {
				files = append(files, AgentFile{
					Source:  "github",
					Name:    repo.Name,
					Path:    fmt.Sprintf("https://github.com/%s/%s/blob/main/GEMINI.md", username, repo.Name),
					Content: string(data),
				})
				continue
			}
		}

		// Download from GitHub
		fmt.Printf("Fetching GEMINI.md for %s/%s...\n", username, repo.Name)
		content, found, err := downloadGEMINI(username, repo.Name)
		if err != nil {
			fmt.Printf("  ⚠ Error downloading for %s: %v\n", repo.Name, err)
			continue
		}

		if !found {
			continue
		}

		// Write to cache
		if err := os.WriteFile(cachePath, []byte(content), 0644); err != nil {
			fmt.Printf("  ⚠ Warning: failed to cache GEMINI.md for %s: %v\n", repo.Name, err)
		}

		files = append(files, AgentFile{
			Source:  "github",
			Name:    repo.Name,
			Path:    fmt.Sprintf("https://github.com/%s/%s/blob/main/GEMINI.md", username, repo.Name),
			Content: content,
		})
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
