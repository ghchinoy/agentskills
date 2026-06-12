package ai

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/ghchinoy/agentskills/internal/scanner"

	"google.golang.org/genai"
)

// GenerateSkillsReport aggregates all discovered agent files, prompts gemini-3.5-flash to analyze them,
// and returns the complete markdown consolidation report.
func GenerateSkillsReport(ctx context.Context, client *genai.Client, files []scanner.AgentFile) (string, error) {
	if len(files) == 0 {
		return "", fmt.Errorf("no agent files to analyze")
	}

	// 1. Construct the files payload for the prompt
	var sb strings.Builder
	for i, f := range files {
		fmt.Fprintf(&sb, "--- AGENT FILE %d ---\n", i+1)
		fmt.Fprintf(&sb, "Source: %s\n", f.Source)
		fmt.Fprintf(&sb, "Name: %s\n", f.Name)
		fmt.Fprintf(&sb, "Path/URL: %s\n", f.Path)
		sb.WriteString("Content:\n")
		sb.WriteString(f.Content)
		sb.WriteString("\n\n")
	}
	filesPayload := sb.String()

	// 2. Formulate the comprehensive prompt
	prompt := fmt.Sprintf(`You are an expert Enterprise AI Architect and Senior Developer Productivity Engineer specializing in multi-agent systems and software architecture.

We have crawled a developer's GitHub repositories and local directories, extracting the "Workspace Rules / Agent Instruction Files" (GEMINI.md).
Each of these files defines the tech stack, standards, quality gates, and specific conventions for AI agents working in that specific repository.

Analyze the raw files payload below and generate a premium, executive-level **Agent Skills Consolidation and Refactoring Report**.

### Raw Agent Files Data:
%s

### Your Analysis Requirements:

Your report must contain the following sections formatted in beautiful, high-quality, professional Markdown:

1.  # Executive Summary
    - Highlight the total number of agent instruction files scanned.
    - Provide a high-level summary of the state of the codebase instructions (diversity of technologies, consistency of conventions, level of duplication).
2.  # Agent Landscape Map
    - Include a comprehensive markdown table mapping each repository to:
      - **Primary Technology Stack** (e.g., Go, TypeScript, React with Ink, Flutter, Rust).
      - **Principal Purpose & Intent** (concise 1-sentence description).
      - **Task Tracking & Tooling** (e.g., Beads/bd, git workflows, make, golangci-lint).
3.  # Core Extracted Skills & Categories
    - Identify and extract distinct, modular "Agent Skills" from across all repositories.
    - Group them into clear semantic categories (e.g., Frontend TUIs, Streaming Audio and Media Engines, CI/CD and Release Automation, Quality Gates and Testing Conformance, Task Management and Git Hygiene).
    - For each category, list which repositories require these skills.
4.  # Duplication & Cross-Agent Overlap Analysis
    - Identify where rules are duplicated or highly similar across repositories.
    - Call out specific patterns (e.g., how Beads/bd commands and Git "Landing the Plane" conventions are duplicated, how Go build/test commands are repeated, how linting rules are defined similarly).
5.  # Consolidation & Skills Refactoring Recommendations
    - **Propose concrete, reusable, modular "Skills"** (e.g., a shared "Beads Task Tracking Skill", a shared "Charm TUI TCK Skill", a shared "Go Library Quality Gate Skill").
    - Explain how consolidating these rules into reusable prompt snippets or central MCP servers would:
      - Shorten context windows (reducing token costs).
      - Ensure standard updates apply universally.
      - Make agent onboardings faster and more consistent.
    - Detail the exact modular skill files or MCP tools you recommend creating, and how they would be mapped to each project.

### Formatting Guidelines:
- Use rich markdown styling (clean headers, bulleted lists, bold accents, blockquotes, and tables).
- Maintain an extremely professional, technical, and objective tone.
- Do NOT wrap the entire response in a markdown code block (e.g., do not put triple-backticks or markdown code fence at the start and end of your reply) - output the raw markdown text directly so it can be saved and rendered cleanly.
`, filesPayload)

	// 3. Invoke gemini-3.5-flash
	fmt.Fprintln(os.Stderr, "Sending aggregate data to gemini-3.5-flash for consolidation analysis...")
	resp, err := client.Models.GenerateContent(ctx, ModelName, genai.Text(prompt), nil)
	if err != nil {
		return "", fmt.Errorf("gemini-3.5-flash generation failed: %w", err)
	}

	reportText := resp.Text()
	if reportText == "" {
		return "", fmt.Errorf("gemini-3.5-flash returned empty response")
	}

	return reportText, nil
}

// CountTokens counts the number of tokens in the given text using gemini-3.5-flash.
func CountTokens(ctx context.Context, client *genai.Client, text string) (int, error) {
	contents := []*genai.Content{
		{
			Parts: []*genai.Part{
				{Text: text},
			},
		},
	}
	resp, err := client.Models.CountTokens(ctx, ModelName, contents, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to count tokens: %w", err)
	}
	return int(resp.TotalTokens), nil
}

