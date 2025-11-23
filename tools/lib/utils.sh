#!/usr/bin/env bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global flag for quiet mode
QUIET_MODE=false

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Silent command execution wrapper
run_silent() {
    local description="$1"
    shift
    local cmd="$@"

    if [[ "$QUIET_MODE" == "true" ]]; then
        # Capture both stdout and stderr
        local output
        local exit_code
        output=$(eval "$cmd" 2>&1)
        exit_code=$?

        if [[ $exit_code -ne 0 ]]; then
            log_error "$description failed"
            echo "$output" >&2
            return $exit_code
        fi
        return 0
    else
        # Normal mode: show output
        eval "$cmd"
    fi
}

# Package manager install wrapper
pkg_install() {
    local packages="$@"

    if [[ "$QUIET_MODE" == "true" ]]; then
        local output
        local exit_code
        output=$($INSTALL_CMD $packages 2>&1)
        exit_code=$?

        if [[ $exit_code -ne 0 ]]; then
            log_error "Failed to install: $packages"
            echo "$output" >&2
            return 1
        fi
        log_success "Installed: $packages"
        return 0
    else
        log_info "Installing: $packages"
        if $INSTALL_CMD $packages; then
            log_success "Installed: $packages"
            return 0
        else
            log_error "Failed to install: $packages"
            return 1
        fi
    fi
}
