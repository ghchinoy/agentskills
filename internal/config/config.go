package config

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/adrg/xdg"
	"github.com/spf13/viper"
)

// Config defines the configuration schema for the agentskills tool.
type Config struct {
	ProjectID  string `mapstructure:"project_id"`
	Location   string `mapstructure:"location"`
	Backend    string `mapstructure:"backend"`     // "vertex" or "gemini"
	GitHubUser string `mapstructure:"github_user"` // Default github username
	APIKey     string `mapstructure:"api_key"`     // For direct Gemini API
}

// Default values for config fields
const (
	DefaultLocation   = "us-central1"
	DefaultBackend    = "vertex"
	DefaultGitHubUser = "ghchinoy"
)

// GetConfigFilePath returns the absolute path to the config file under XDG specs.
func GetConfigFilePath() (string, error) {
	return xdg.ConfigFile("agentskills/config.yaml")
}

// GetCacheDir returns the absolute path to the cache directory under XDG specs.
func GetCacheDir() (string, error) {
	return xdg.CacheFile("agentskills")
}

// InitConfig initializes the Viper configuration and writes the default config if it doesn't exist.
func InitConfig() (*Config, error) {
	configPath, err := GetConfigFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to resolve XDG config path: %w", err)
	}

	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}

	viper.SetConfigFile(configPath)
	viper.SetConfigType("yaml")

	// Set defaults
	viper.SetDefault("project_id", "")
	viper.SetDefault("location", DefaultLocation)
	viper.SetDefault("backend", DefaultBackend)
	viper.SetDefault("github_user", DefaultGitHubUser)
	viper.SetDefault("api_key", "")

	// Environment variable bindings
	viper.SetEnvPrefix("AGENTSKILLS")
	viper.AutomaticEnv()

	// If file does not exist, write default config
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		if err := viper.WriteConfig(); err != nil {
			return nil, fmt.Errorf("failed to write default config file: %w", err)
		}
	} else {
		if err := viper.ReadInConfig(); err != nil {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal configuration: %w", err)
	}

	if cfg.ProjectID == "" {
		if project := DetectGCPProject(); project != "" {
			cfg.ProjectID = project
			viper.Set("project_id", project)
			_ = SaveConfig()
		}
	}

	return &cfg, nil
}

// SaveConfig writes the current Viper configuration state back to the config file.
func SaveConfig() error {
	configPath, err := GetConfigFilePath()
	if err != nil {
		return err
	}
	return viper.WriteConfigAs(configPath)
}

// DetectGCPProject attempts to query the active gcloud configuration for the project ID.
func DetectGCPProject() string {
	cmd := exec.Command("gcloud", "config", "get-value", "project")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err == nil {
		project := strings.TrimSpace(stdout.String())
		if project != "" && !strings.Contains(project, "unset") {
			return project
		}
	}
	return ""
}
