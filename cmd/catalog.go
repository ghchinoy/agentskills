package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/ghchinoy/agentskills/internal/catalog"
	"github.com/ghchinoy/agentskills/internal/ui"

	"github.com/spf13/cobra"
)

var (
	jsonCatalog bool
)

// catalogCmd represents the catalog command
var catalogCmd = &cobra.Command{
	Use:     "catalog",
	GroupID: "ops",
	Short:   "Display the local catalog of discovered agent skills",
	Long:    `View the local queryable database of skills discovered across previous scans.`,
	Example: `  # List all discovered skills in human-readable format
  agentskills catalog

  # Output the raw catalog JSON to stdout
  agentskills catalog --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cat, err := catalog.LoadCatalog()
		if err != nil {
			return fmt.Errorf("failed to load catalog: %w", err)
		}

		if jsonCatalog {
			data, err := json.MarshalIndent(cat, "", "  ")
			if err != nil {
				return fmt.Errorf("failed to marshal catalog: %w", err)
			}
			fmt.Println(string(data))
			return nil
		}

		path, _ := catalog.GetCatalogFilePath()
		fmt.Printf("Skills Catalog File: %s\n", ui.ID(path))
		fmt.Printf("Total Discovered Skills: %d\n", len(cat.Skills))
		fmt.Printf("Total Scanned Sources:   %d\n\n", len(cat.ScannedRepositories))

		if len(cat.Skills) == 0 {
			fmt.Println("No skills discovered yet. Run 'agentskills scan' to discover skills.")
			return nil
		}

		fmt.Println(ui.Accent("=== Discovered Skills List ==="))
		for i, s := range cat.Skills {
			fmt.Printf("%d. %s\n", i+1, ui.Accent(s.Name))
			if s.Description != "" {
				fmt.Printf("   Description:  %s\n", s.Description)
			}
			if len(s.Capabilities) > 0 {
				fmt.Println("   Capabilities:")
				for _, capVal := range s.Capabilities {
					fmt.Printf("     - %s\n", capVal)
				}
			}
			if len(s.Sources) > 0 {
				fmt.Println("   Sources:")
				for _, src := range s.Sources {
					fmt.Printf("     * [%s] %s (%s)\n", ui.Muted(src.Type), ui.ID(src.Name), src.Path)
				}
			}
			fmt.Printf("   First Discovered: %s\n", s.FirstDiscovered.Format("2006-01-02 15:04:05"))
			fmt.Printf("   Last Updated:     %s\n\n", s.LastUpdated.Format("2006-01-02 15:04:05"))
		}
		fmt.Println(ui.Accent("=============================="))

		return nil
	},
}

func init() {
	catalogCmd.Flags().BoolVar(&jsonCatalog, "json", false, "Output raw catalog in JSON format")
	rootCmd.AddCommand(catalogCmd)
}
