package cmd

import (
	"context"
	"fmt"
	"os"

	"agentskills/internal/ai"
	"agentskills/internal/scanner"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	githubScan   string
	localScan    string
	outputFile   string
	forceRefresh bool
	deepScan     bool
)

// scanCmd represents the scan command
var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "Scan and analyze agent files (GEMINI.md) for skills",
	Long: `Scan local directories or public GitHub repositories for GEMINI.md files,
analyze them using gemini-3.5-flash, extract skills, and generate a consolidation report.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Use default from config if not specified
		if githubScan == "" && localScan == "" {
			githubScan = viper.GetString("github_user")
		}

		if githubScan == "" && localScan == "" {
			return fmt.Errorf("either --github (GitHub user) or --local (local path) must be specified, or github_user set in config")
		}

		var allFiles []scanner.AgentFile

		fmt.Println("=== Starting Agent Skills Scan ===")

		if localScan != "" {
			fmt.Printf("Scanning local path: %s...\n", localScan)
			localFiles, err := scanner.LocalScanner(localScan, deepScan)
			if err != nil {
				return fmt.Errorf("local scan failed: %w", err)
			}
			allFiles = append(allFiles, localFiles...)
			fmt.Printf("✓ Local scan finished. Found %d agent rule files.\n\n", len(localFiles))
		}

		if githubScan != "" {
			fmt.Printf("Scanning GitHub profile: %s...\n", githubScan)
			githubFiles, err := scanner.GitHubScanner(githubScan, forceRefresh, deepScan)
			if err != nil {
				return fmt.Errorf("GitHub scan failed: %w", err)
			}
			allFiles = append(allFiles, githubFiles...)
			fmt.Printf("✓ GitHub scan finished. Loaded %d agent rule files.\n\n", len(githubFiles))
		}

		fmt.Println("=== Discovery Summary ===")
		fmt.Printf("Total files loaded: %d\n", len(allFiles))
		for _, f := range allFiles {
			fmt.Printf("  - [%s] %s\n", f.Source, f.Name)
		}
		fmt.Println("=========================")

		if len(allFiles) == 0 {
			fmt.Println("No agent rule files found to analyze.")
			return nil
		}

		// 3. Initialize official GenAI client
		ctx := context.Background()
		client, err := ai.NewClient(ctx, cfg)
		if err != nil {
			return err
		}

		// Calculate input token statistics
		fmt.Println("\n=== Token & Context Statistics ===")
		var totalInputTokens int
		for _, f := range allFiles {
			tokens, err := ai.CountTokens(ctx, client, f.Content)
			if err != nil {
				fmt.Printf("  - [%s] %s: (unable to count tokens: %v)\n", f.Source, f.Name, err)
				continue
			}
			fmt.Printf("  - [%s] %s: %d tokens\n", f.Source, f.Name, tokens)
			totalInputTokens += tokens
		}
		fmt.Printf("Total input context footprint: %d tokens\n", totalInputTokens)

		// 4. Generate the Consolidation Report
		fmt.Println("\nAnalysing files with gemini-3.5-flash...")
		report, err := ai.GenerateSkillsReport(ctx, client, allFiles)
		if err != nil {
			return fmt.Errorf("analysis report generation failed: %w", err)
		}

		// 5. Write report to output file
		if err := os.WriteFile(outputFile, []byte(report), 0644); err != nil {
			return fmt.Errorf("failed to write consolidation report to %q: %w", outputFile, err)
		}

		// Calculate generated report token count
		reportTokens, err := ai.CountTokens(ctx, client, report)
		if err == nil {
			fmt.Printf("Consolidated report size: %d tokens\n", reportTokens)
			if totalInputTokens > 0 {
				reduction := float64(totalInputTokens-reportTokens) / float64(totalInputTokens) * 100
				fmt.Printf("Instruction context footprint change: %.1f%%\n", reduction)
			}
		}

		fmt.Printf("\n✓ Success! Consolidation report generated successfully.\n")
		fmt.Printf("Saved to: %s\n", outputFile)

		return nil
	},
}

func init() {
	scanCmd.Flags().StringVar(&githubScan, "github", "", "Scan public repositories of this GitHub username")
	scanCmd.Flags().StringVar(&localScan, "local", "", "Scan this local path (e.g. '.' or specific directory) recursively")
	scanCmd.Flags().StringVarP(&outputFile, "output", "o", "./skills_report.md", "Target path for the generated markdown report")
	scanCmd.Flags().BoolVarP(&forceRefresh, "force-refresh", "f", false, "Force refresh GitHub CDN downloads (bypass local XDG cache)")
	scanCmd.Flags().BoolVarP(&deepScan, "deep", "d", false, "Perform deep repository/codebase scanning to extract dependencies, build structures, and script details")

	rootCmd.AddCommand(scanCmd)
}
