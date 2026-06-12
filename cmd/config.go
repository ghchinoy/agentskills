package cmd

import (
	"fmt"
	"strings"

	"github.com/ghchinoy/agentskills/internal/config"
	"github.com/ghchinoy/agentskills/internal/ui"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// configCmd represents the config command
var configCmd = &cobra.Command{
	Use:     "config",
	GroupID: "config",
	Short:   "Manage configuration settings for agentskills",
	Long:    `View and modify configuration parameters like GCP project ID, region, backend type, and default GitHub user.`,
	Example: `  # Display current configuration
  agentskills config show

  # Set configuration project_id
  agentskills config set project_id my-gcp-project`,
}

// showConfigCmd represents the config show subcommand
var showConfigCmd = &cobra.Command{
	Use:     "show",
	Short:   "Display the current configuration",
	Example: `  agentskills config show`,
	Run: func(cmd *cobra.Command, args []string) {
		path, _ := config.GetConfigFilePath()
		fmt.Printf("Configuration File: %s\n\n", ui.ID(path))
		printConfigVal("project_id", viper.GetString("project_id"))
		printConfigVal("location", viper.GetString("location"))
		printConfigVal("backend", viper.GetString("backend"))
		printConfigVal("github_user", viper.GetString("github_user"))

		apiKey := viper.GetString("api_key")
		if apiKey != "" {
			var masked string
			if len(apiKey) > 8 {
				masked = apiKey[:4] + "..." + apiKey[len(apiKey)-4:]
			} else {
				masked = "********"
			}
			fmt.Printf("%-12s %s\n", "api_key:", ui.ID(masked))
		} else {
			fmt.Printf("%-12s %s\n", "api_key:", ui.Muted("(not set)"))
		}
	},
}

// setConfigCmd represents the config set subcommand
var setConfigCmd = &cobra.Command{
	Use:     "set [key] [value]",
	Short:   "Set a configuration parameter",
	Args:    cobra.ExactArgs(2),
	Example: `  # Set GCP project ID
  agentskills config set project_id my-gcp-project-123

  # Set generative AI backend
  agentskills config set backend gemini`,
	Long: `Set configuration keys. Valid keys are:
  - project_id:  Google Cloud Project ID
  - location:    GCP Region (e.g. us-central1)
  - backend:     AI backend (vertex or gemini)
  - github_user: Default GitHub username for scans
  - api_key:     API key for direct Gemini API`,
	RunE: func(cmd *cobra.Command, args []string) error {
		key := strings.ToLower(args[0])
		val := args[1]

		switch key {
		case "project_id", "location", "backend", "github_user", "api_key":
			viper.Set(key, val)
			if err := config.SaveConfig(); err != nil {
				return fmt.Errorf("failed to save config: %w", err)
			}
			fmt.Printf("%s Set configuration key %q to %q\n", ui.Pass("✓"), ui.Accent(key), ui.ID(val))
			return nil
		default:
			return fmt.Errorf("invalid config key %q. Valid keys are: project_id, location, backend, github_user, api_key", key)
		}
	},
}

func init() {
	configCmd.AddCommand(showConfigCmd)
	configCmd.AddCommand(setConfigCmd)
	rootCmd.AddCommand(configCmd)
}

func printConfigVal(key, val string) {
	if val == "" {
		fmt.Printf("%-12s %s\n", key+":", ui.Muted("(not set)"))
	} else {
		fmt.Printf("%-12s %s\n", key+":", ui.ID(val))
	}
}
