.PHONY: all build clean test lint

# Binary output configuration
BINARY_NAME=agentskills
BUILD_DIR=bin

all: build

build:
	@echo "Building $(BINARY_NAME) to $(BUILD_DIR)/..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) main.go

clean:
	@echo "Cleaning up build directory..."
	rm -rf $(BUILD_DIR)

test:
	@echo "Running tests..."
	go test -v ./...

lint:
	@echo "Running linter..."
	golangci-lint run ./...
