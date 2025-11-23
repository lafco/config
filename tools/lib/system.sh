#!/usr/bin/env bash
# Dependencies: utils.sh (logging)

# Exported variables (set by detect_system)
OS=""
PKG_MANAGER=""
INSTALL_CMD=""
UPDATE_CMD=""

# Disable a broken repository
disable_broken_repo() {
    local repo_url="$1"
    log_info "Attempting to disable broken repository: $repo_url"

    # Look for source list files that contain this URL
    local sources_dir="/etc/apt/sources.list.d"
    if [ -d "$sources_dir" ]; then
        for file in "$sources_dir"/*.list; do
            if [ -f "$file" ] && grep -q "$repo_url" "$file"; then
                local filename=$(basename "$file")
                log_warning "Disabling broken repository file: $filename"

                # Create backup and disable the file
                sudo cp "$file" "$file.broken-backup-$(date +%Y%m%d)"
                sudo mv "$file" "$file.disabled"

                log_success "Disabled $filename (backup created)"
                return 0
            fi
        done
    fi

    # Also check main sources.list
    if grep -q "$repo_url" /etc/apt/sources.list 2>/dev/null; then
        log_warning "Found broken repository in main sources.list"
        log_info "You may need to manually edit /etc/apt/sources.list to remove: $repo_url"
    fi
}

# Detect and handle broken PPAs on Ubuntu
detect_and_fix_broken_ppas() {
    if [[ "$PKG_MANAGER" == "apt" ]]; then
        log_info "Checking for broken PPAs..."

        # Create a temporary file to capture apt update errors
        local temp_log=$(mktemp)

        # Run apt update and capture errors
        if ! sudo apt update 2>"$temp_log"; then
            log_warning "apt update failed, checking for broken PPAs..."

            # Parse the error log for broken repositories
            local broken_repos=()
            while IFS= read -r line; do
                if [[ "$line" =~ "não tem um arquivo Release" ]] || [[ "$line" =~ "does not have a Release file" ]] || [[ "$line" =~ "Release file" ]]; then
                    # Extract repository URL from error message
                    if [[ "$line" =~ https?://[^[:space:]]+ ]]; then
                        local repo_url="${BASH_REMATCH[0]}"
                        broken_repos+=("$repo_url")
                        log_warning "Found broken repository: $repo_url"
                    fi
                fi
            done < "$temp_log"

            # Try to disable broken repositories
            for repo in "${broken_repos[@]}"; do
                disable_broken_repo "$repo"
            done

            # Try apt update again after disabling broken repos
            if [ ${#broken_repos[@]} -gt 0 ]; then
                log_info "Retrying apt update after disabling broken repositories..."
                if sudo apt update; then
                    log_success "apt update succeeded after fixing broken repositories"
                else
                    log_warning "apt update still has issues, but continuing with installation..."
                fi
            fi
        else
            log_success "Package lists updated successfully"
        fi

        # Clean up temp file
        rm -f "$temp_log"
    fi
}

# Detect OS and package manager
detect_system() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt &> /dev/null; then
            OS="ubuntu"
            PKG_MANAGER="apt"
            INSTALL_CMD="sudo apt install -y"
            UPDATE_CMD="sudo apt update"
        elif command -v dnf &> /dev/null; then
            OS="fedora"
            PKG_MANAGER="dnf"
            INSTALL_CMD="sudo dnf install -y"
            UPDATE_CMD="sudo dnf update"
        elif command -v pacman &> /dev/null; then
            OS="arch"
            PKG_MANAGER="pacman"
            INSTALL_CMD="sudo pacman -S --noconfirm"
            UPDATE_CMD="sudo pacman -Sy"
        elif command -v zypper &> /dev/null; then
            OS="opensuse"
            PKG_MANAGER="zypper"
            INSTALL_CMD="sudo zypper install -y"
            UPDATE_CMD="sudo zypper refresh"
        else
            log_error "Unsupported Linux distribution"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        if ! command -v brew &> /dev/null; then
            log_info "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        PKG_MANAGER="brew"
        INSTALL_CMD="brew install"
        UPDATE_CMD="brew update"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi

    log_info "Detected OS: $OS"
    log_info "Package manager: $PKG_MANAGER"
}
