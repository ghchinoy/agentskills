package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ghchinoy/agentskills/internal/ai"
	"github.com/ghchinoy/agentskills/internal/catalog"
	"github.com/ghchinoy/agentskills/internal/scanner"
	"github.com/ghchinoy/agentskills/internal/ui"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	githubScan   string
	localScan    string
	outputFile   string
	forceRefresh bool
	deepScan     bool
	jsonOutput   bool
	forceScan    bool
)

type ScanResult struct {
	Files            []FileEntry `json:"files"`
	TotalInputTokens int         `json:"total_input_tokens"`
	ReportTokens     int         `json:"report_tokens"`
	ReductionPercent float64     `json:"reduction_percentage"`
	Report           interface{} `json:"report"`
	OutputFile       string      `json:"output_file"`
}

type FileEntry struct {
	Source string `json:"source"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	Tokens int    `json:"tokens"`
}

// scanCmd represents the scan command
var scanCmd = &cobra.Command{
	Use:     "scan",
	GroupID: "ops",
	Short:   "Scan and analyze agent instruction and rule files for skills",
	Long: `Scan local directories or public GitHub repositories for agent instruction and rule files (such as GEMINI.md, CLAUDE.md, AGENTS.md, or .cursorrules),
analyze them using gemini-3.7-flash, extract skills, and generate a consolidation report.`,
	Example: `  # Scan the current directory recursively and save report to default output path
  agentskills scan --local .

  # Scan public repositories of a GitHub user
  agentskills scan --github ghchinoy

  # Perform a deep scan of local path and save to custom report path
  agentskills scan --local /path/to/project --deep -o ./reports/my_skills.md`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Use default from config if not specified
		if githubScan == "" && localScan == "" {
			githubScan = viper.GetString("github_user")
		}

		if githubScan == "" && localScan == "" {
			return fmt.Errorf("either --github (GitHub user) or --local (local path) must be specified, or github_user set in config")
		}

		var allFiles []scanner.AgentFile

		if !jsonOutput {
			fmt.Println(ui.Accent("=== Starting Agent Skills Scan ==="))
		}

		if localScan != "" {
			if !jsonOutput {
				fmt.Printf("Scanning local path: %s...\n", ui.ID(localScan))
			}
			localFiles, err := scanner.LocalScanner(localScan, deepScan)
			if err != nil {
				return fmt.Errorf("local scan failed: %w", err)
			}
			allFiles = append(allFiles, localFiles...)
			if !jsonOutput {
				fmt.Printf("%s Local scan finished. Found %d agent rule files.\n\n", ui.Pass("✓"), len(localFiles))
			}
		}

		if githubScan != "" {
			if !jsonOutput {
				fmt.Printf("Scanning GitHub profile: %s...\n", ui.ID(githubScan))
			}
			githubFiles, err := scanner.GitHubScanner(githubScan, forceRefresh, deepScan)
			if err != nil {
				return fmt.Errorf("GitHub scan failed: %w", err)
			}
			allFiles = append(allFiles, githubFiles...)
			if !jsonOutput {
				fmt.Printf("%s GitHub scan finished. Loaded %d agent rule files.\n\n", ui.Pass("✓"), len(githubFiles))
			}
		}

		if !jsonOutput {
			fmt.Println(ui.Accent("=== Discovery Summary ==="))
			fmt.Printf("Total files loaded: %d\n", len(allFiles))
			for _, f := range allFiles {
				fmt.Printf("  - [%s] %s\n", ui.Muted(f.Source), ui.ID(f.Name))
			}
			fmt.Println(ui.Accent("========================="))
		}

		if len(allFiles) == 0 {
			if !jsonOutput {
				fmt.Println("No agent rule files found to analyze.")
			}
			return nil
		}

		// Scale safety gate
		if len(allFiles) > 10 && !forceScan {
			return fmt.Errorf("scan found %d agent rule files. To prevent API rate limits and context window bloat, the scale safety gate limits single scans to 10 files. Please narrow your search path or use the --force-scan flag to bypass this limit", len(allFiles))
		}

		// 3. Initialize official GenAI client
		ctx := context.Background()
		client, err := ai.NewClient(ctx, cfg)
		if err != nil {
			return err
		}

		// Calculate input token statistics
		if !jsonOutput {
			fmt.Println(ui.Accent("\n=== Token & Context Statistics ==="))
		}
		var fileEntries []FileEntry
		var totalInputTokens int
		for _, f := range allFiles {
			tokens, err := ai.CountTokens(ctx, client, f.Content)
			if err != nil {
				if !jsonOutput {
					fmt.Printf("  - [%s] %s: (unable to count tokens: %v)\n", ui.Muted(f.Source), ui.ID(f.Name), err)
				}
				continue
			}
			if !jsonOutput {
				fmt.Printf("  - [%s] %s: %d %s\n", ui.Muted(f.Source), ui.ID(f.Name), tokens, ui.Muted("tokens"))
			}
			totalInputTokens += tokens
			fileEntries = append(fileEntries, FileEntry{
				Source: f.Source,
				Name:   f.Name,
				Path:   f.Path,
				Tokens: tokens,
			})
		}
		if !jsonOutput {
			fmt.Printf("Total input context footprint: %d %s\n", totalInputTokens, ui.Muted("tokens"))
		}

		// 4. Generate the structured JSON report (always) to update the catalog database
		jsonReport, err := ai.GenerateSkillsReportJSON(ctx, client, allFiles)
		if err != nil {
			return fmt.Errorf("structured analysis failed: %w", err)
		}

		// Parse the JSON report
		cleanReport := cleanJSON(jsonReport)
		var analysis map[string]interface{}
		if err := json.Unmarshal([]byte(cleanReport), &analysis); err != nil {
			return fmt.Errorf("failed to parse structured analysis report: %w. Raw output: %s", err, jsonReport)
		}

		// If human-readable report is requested, also generate the rich markdown report
		var reportMarkdown string
		if !jsonOutput {
			fmt.Printf("\nAnalysing files with %s...\n", ui.Command(ai.ModelName))
			reportMarkdown, err = ai.GenerateSkillsReport(ctx, client, allFiles)
			if err != nil {
				return fmt.Errorf("markdown report generation failed: %w", err)
			}
		}

		// 5. Ensure parent directory of output file exists
		outputDir := filepath.Dir(outputFile)
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %q for output file: %w", outputDir, err)
		}

		// 6. Write report to output file
		if !jsonOutput {
			if err := os.WriteFile(outputFile, []byte(reportMarkdown), 0644); err != nil {
				return fmt.Errorf("failed to write consolidation report to %q: %w", outputFile, err)
			}
		} else {
			if err := os.WriteFile(outputFile, []byte(jsonReport), 0644); err != nil {
				return fmt.Errorf("failed to write consolidation report to %q: %w", outputFile, err)
			}
		}

		// Calculate generated report token count
		var reportTokens int
		if !jsonOutput {
			reportTokens, err = ai.CountTokens(ctx, client, reportMarkdown)
		} else {
			reportTokens, err = ai.CountTokens(ctx, client, jsonReport)
		}

		var reduction float64
		if err == nil {
			if totalInputTokens > 0 {
				reduction = float64(totalInputTokens-reportTokens) / float64(totalInputTokens) * 100
			}
			if !jsonOutput {
				fmt.Printf("Consolidated report size: %d %s\n", reportTokens, ui.Muted("tokens"))
				if totalInputTokens > 0 {
					fmt.Printf("Instruction context footprint change: %.1f%%\n", reduction)
				}
			}
		}

		// 7. Update local discovered skills catalog
		cat, err := catalog.LoadCatalog()
		if err == nil && cat != nil {
			if skillsInterface, ok := analysis["skills"]; ok {
				if skillsSlice, ok := skillsInterface.([]interface{}); ok {
					for _, item := range skillsSlice {
						if skillMap, ok := item.(map[string]interface{}); ok {
							name, _ := skillMap["name"].(string)
							desc, _ := skillMap["description"].(string)
							var caps []string
							if capsInterface, ok := skillMap["capabilities"]; ok {
								if capsSlice, ok := capsInterface.([]interface{}); ok {
									for _, capVal := range capsSlice {
										if str, ok := capVal.(string); ok {
											caps = append(caps, str)
										}
									}
								}
							}

							for _, f := range allFiles {
								cat.AddOrUpdateSkill(name, desc, caps, catalog.SourceMetadata{
									Type: f.Source,
									Name: f.Name,
									Path: f.Path,
								})
							}
						}
					}
				}
			}

			for _, f := range allFiles {
				cat.TrackRepository(f.Source, f.Name, f.Path)
			}

			if err := catalog.SaveCatalog(cat); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: failed to save skills catalog: %v\n", err)
			}
		}

		if !jsonOutput {
			fmt.Printf("\n%s\n", ui.Pass("✓ Success! Consolidation report generated successfully."))
			fmt.Printf("Saved to: %s\n", ui.ID(outputFile))
		} else {
			// Print structured JSON to stdout
			result := ScanResult{
				Files:            fileEntries,
				TotalInputTokens:  totalInputTokens,
				ReportTokens:      reportTokens,
				ReductionPercent:  reduction,
				Report:            analysis,
				OutputFile:        outputFile,
			}
			data, err := json.MarshalIndent(result, "", "  ")
			if err != nil {
				return fmt.Errorf("failed to marshal JSON output: %w", err)
			}
			fmt.Println(string(data))
		}

		return nil
	},
}

func init() {
	scanCmd.Flags().StringVar(&githubScan, "github", "", "Scan public repositories of this GitHub username")
	scanCmd.Flags().StringVar(&localScan, "local", "", "Scan this local path (e.g. '.' or specific directory) recursively")
	scanCmd.Flags().StringVarP(&outputFile, "output", "o", "./skills_report.md", "Target path for the generated markdown report")
	scanCmd.Flags().BoolVarP(&forceRefresh, "force-refresh", "f", false, "Force refresh GitHub CDN downloads (bypass local XDG cache)")
	scanCmd.Flags().BoolVarP(&deepScan, "deep", "d", false, "Perform deep repository/codebase scanning to extract dependencies, build structures, and script details")
	scanCmd.Flags().BoolVar(&jsonOutput, "json", false, "Output results in JSON format to stdout")
	scanCmd.Flags().BoolVar(&forceScan, "force-scan", false, "Bypass scale safety gate (allow scanning more than 10 files)")

	rootCmd.AddCommand(scanCmd)
}

func cleanJSON(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		idx := strings.Index(s, "\n")
		if idx >= 0 {
			s = s[idx+1:]
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	return s
}
