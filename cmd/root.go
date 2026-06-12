package cmd

import (
	"fmt"
	"os"

	"agentskills/internal/config"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	cfgFile string
	cfg     *config.Config
)

var Version = "1.0.0"

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:     "agentskills",
	Short:   "agentskills is a CLI tool to extract, categorize, and combine AI agent skills",
	Version: Version,
	Long: `agentskills parses GEMINI.md files from local directories or GitHub repositories,
uses gemini-3.5-flash to analyze coding agent conventions, quality gates, and tech stacks,
extracts core capabilities, and recommends how to consolidate them into cohesive skills.`,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		var err error
		cfg, err = config.InitConfig()
		if err != nil {
			return fmt.Errorf("failed to load configuration: %w", err)
		}

		// Bind flags to viper
		if val, _ := cmd.Flags().GetString("project"); val != "" {
			viper.Set("project_id", val)
			cfg.ProjectID = val
		}
		if val, _ := cmd.Flags().GetString("location"); val != "" {
			viper.Set("location", val)
			cfg.Location = val
		}
		if val, _ := cmd.Flags().GetString("backend"); val != "" {
			viper.Set("backend", val)
			cfg.Backend = val
		}
		if val, _ := cmd.Flags().GetString("github-user"); val != "" {
			viper.Set("github_user", val)
			cfg.GitHubUser = val
		}
		if val, _ := cmd.Flags().GetString("api-key"); val != "" {
			viper.Set("api_key", val)
			cfg.APIKey = val
		}

		return nil
	},
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	// Persistent flags (available to all subcommands)
	rootCmd.PersistentFlags().StringP("project", "p", "", "Google Cloud Project ID")
	rootCmd.PersistentFlags().StringP("location", "l", "", "Google Cloud Location / Region (e.g. us-central1)")
	rootCmd.PersistentFlags().StringP("backend", "b", "", "Generative AI backend: vertex or gemini")
	rootCmd.PersistentFlags().String("github-user", "", "Default GitHub username")
	rootCmd.PersistentFlags().String("api-key", "", "Direct Gemini API Key (if using gemini backend)")

	// Bind flags to viper (for default fallbacks when flag is not set explicitly)
	viper.BindPFlag("project_id", rootCmd.PersistentFlags().Lookup("project"))
	viper.BindPFlag("location", rootCmd.PersistentFlags().Lookup("location"))
	viper.BindPFlag("backend", rootCmd.PersistentFlags().Lookup("backend"))
	viper.BindPFlag("github_user", rootCmd.PersistentFlags().Lookup("github-user"))
	viper.BindPFlag("api_key", rootCmd.PersistentFlags().Lookup("api-key"))
}
