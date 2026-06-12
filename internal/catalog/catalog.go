package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/adrg/xdg"
)

type Catalog struct {
	Skills              []SkillEntry         `json:"skills"`
	ScannedRepositories []RepositoryMetadata `json:"scanned_repositories"`
}

type SkillEntry struct {
	Name            string           `json:"name"`
	Description     string           `json:"description"`
	Capabilities    []string         `json:"capabilities"`
	Sources         []SourceMetadata `json:"sources"`
	FirstDiscovered time.Time        `json:"first_discovered"`
	LastUpdated     time.Time        `json:"last_updated"`
}

type SourceMetadata struct {
	Type string `json:"type"` // "local" or "github"
	Name string `json:"name"`
	Path string `json:"path"`
}

type RepositoryMetadata struct {
	Source      string    `json:"source"`
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	LastScanned time.Time `json:"last_scanned"`
}

func GetCatalogFilePath() (string, error) {
	return xdg.ConfigFile("agentskills/catalog.json")
}

func LoadCatalog() (*Catalog, error) {
	path, err := GetCatalogFilePath()
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &Catalog{
			Skills:              []SkillEntry{},
			ScannedRepositories: []RepositoryMetadata{},
		}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read catalog file: %w", err)
	}

	var cat Catalog
	if err := json.Unmarshal(data, &cat); err != nil {
		return nil, fmt.Errorf("failed to unmarshal catalog: %w", err)
	}

	if cat.Skills == nil {
		cat.Skills = []SkillEntry{}
	}
	if cat.ScannedRepositories == nil {
		cat.ScannedRepositories = []RepositoryMetadata{}
	}

	return &cat, nil
}

func SaveCatalog(cat *Catalog) error {
	path, err := GetCatalogFilePath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create catalog directory: %w", err)
	}

	data, err := json.MarshalIndent(cat, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal catalog: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write catalog file: %w", err)
	}

	return nil
}

// AddOrUpdateSkill updates the catalog with a new skill or merges it into an existing one.
func (c *Catalog) AddOrUpdateSkill(name, desc string, capabilities []string, source SourceMetadata) {
	now := time.Now()
	foundIdx := -1
	for i, s := range c.Skills {
		if strings.EqualFold(s.Name, name) {
			foundIdx = i
			break
		}
	}

	if foundIdx >= 0 {
		s := &c.Skills[foundIdx]
		s.LastUpdated = now
		if desc != "" && s.Description == "" {
			s.Description = desc
		}

		capMap := make(map[string]bool)
		for _, capVal := range s.Capabilities {
			capMap[strings.ToLower(strings.TrimSpace(capVal))] = true
		}
		for _, capVal := range capabilities {
			val := strings.TrimSpace(capVal)
			if val != "" && !capMap[strings.ToLower(val)] {
				s.Capabilities = append(s.Capabilities, val)
				capMap[strings.ToLower(val)] = true
			}
		}

		srcExists := false
		for _, src := range s.Sources {
			if src.Type == source.Type && src.Path == source.Path {
				srcExists = true
				break
			}
		}
		if !srcExists {
			s.Sources = append(s.Sources, source)
		}
	} else {
		c.Skills = append(c.Skills, SkillEntry{
			Name:            name,
			Description:     desc,
			Capabilities:    capabilities,
			Sources:         []SourceMetadata{source},
			FirstDiscovered: now,
			LastUpdated:     now,
		})
	}
}

// TrackRepository updates scanning metadata for a repository.
func (c *Catalog) TrackRepository(sourceType, name, path string) {
	now := time.Now()
	foundIdx := -1
	for i, r := range c.ScannedRepositories {
		if r.Source == sourceType && r.Path == path {
			foundIdx = i
			break
		}
	}

	if foundIdx >= 0 {
		c.ScannedRepositories[foundIdx].LastScanned = now
	} else {
		c.ScannedRepositories = append(c.ScannedRepositories, RepositoryMetadata{
			Source:      sourceType,
			Name:        name,
			Path:        path,
			LastScanned: now,
		})
	}
}
