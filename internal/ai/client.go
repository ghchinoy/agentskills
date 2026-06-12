package ai

import (
	"context"
	"fmt"
	"os"

	"github.com/ghchinoy/agentskills/internal/config"
	"github.com/ghchinoy/agentskills/internal/ui"

	"google.golang.org/genai"
)

// ModelName represents the official Gemini 3.5 Flash model identifier.
const ModelName = "gemini-3.5-flash"

// NewClient initializes and returns the official Google GenAI SDK Client based on the configuration.
func NewClient(ctx context.Context, cfg *config.Config) (*genai.Client, error) {
	if cfg == nil {
		return nil, fmt.Errorf("configuration cannot be nil")
	}

	var clientConfig *genai.ClientConfig

	switch cfg.Backend {
	case "vertex":
		// Vertex AI backend setup
		project := cfg.ProjectID
		if project == "" {
			project = os.Getenv("GOOGLE_CLOUD_PROJECT")
		}

		if project == "" {
			return nil, fmt.Errorf("vertex AI requires a Google Cloud Project ID. Set it via:\n  agentskills config set project_id <your-project-id>\nor by exporting the GOOGLE_CLOUD_PROJECT environment variable")
		}

		location := cfg.Location
		if location == "" {
			location = os.Getenv("GOOGLE_CLOUD_LOCATION")
		}
		if location == "" {
			location = config.DefaultLocation
		}

		clientConfig = &genai.ClientConfig{
			Project:  project,
			Location: location,
			Backend:  genai.BackendVertexAI,
		}
		fmt.Printf("%s Using Vertex AI Backend | Project: %s | Location: %s\n", ui.Pass("✓"), ui.ID(project), ui.ID(location))

	case "gemini":
		// Direct Gemini API setup
		apiKey := cfg.APIKey
		if apiKey == "" {
			apiKey = os.Getenv("GEMINI_API_KEY")
		}

		if apiKey == "" {
			apiKey = os.Getenv("GOOGLE_API_KEY")
		}

		if apiKey != "" {
			clientConfig = &genai.ClientConfig{
				APIKey:  apiKey,
				Backend: genai.BackendGeminiAPI,
			}
		} else {
			// Let the SDK pick up the API key from environment variables on its own
			clientConfig = nil
		}
		fmt.Printf("%s Using Direct Gemini API Backend\n", ui.Pass("✓"))

	default:
		return nil, fmt.Errorf("invalid backend %q. Must be 'vertex' or 'gemini'", cfg.Backend)
	}

	client, err := genai.NewClient(ctx, clientConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create GenAI client: %w", err)
	}

	return client, nil
}
