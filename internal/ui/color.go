package ui

import (
	"os"
)

var (
	// EnableColors is true if stdout supports colors and NO_COLOR is not set.
	EnableColors = shouldEnableColors()

	// Semantic Color Codes
	ColorReset   = "\033[0m"
	ColorAccent  = "\033[1;34m" // Blue (bold)
	ColorPass    = "\033[1;32m" // Green (bold)
	ColorWarn    = "\033[1;33m" // Yellow (bold)
	ColorFail    = "\033[1;31m" // Red (bold)
	ColorMuted   = "\033[90m"   // Dark Grey
	ColorID      = "\033[1;36m" // Teal/Mint (bold)
	ColorCommand = "\033[37m"   // Light Grey
)

func shouldEnableColors() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	// TTY detection using os.Stdout.Stat()
	fileInfo, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fileInfo.Mode() & os.ModeCharDevice) != 0
}

func Accent(s string) string {
	if !EnableColors {
		return s
	}
	return ColorAccent + s + ColorReset
}

func Pass(s string) string {
	if !EnableColors {
		return s
	}
	return ColorPass + s + ColorReset
}

func Warn(s string) string {
	if !EnableColors {
		return s
	}
	return ColorWarn + s + ColorReset
}

func Fail(s string) string {
	if !EnableColors {
		return s
	}
	return ColorFail + s + ColorReset
}

func Muted(s string) string {
	if !EnableColors {
		return s
	}
	return ColorMuted + s + ColorReset
}

func ID(s string) string {
	if !EnableColors {
		return s
	}
	return ColorID + s + ColorReset
}

func Command(s string) string {
	if !EnableColors {
		return s
	}
	return ColorCommand + s + ColorReset
}
