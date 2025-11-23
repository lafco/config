#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

# Install GAH (GitHub Apt Helper)
install_gah() {
    if command -v gah &> /dev/null; then
        log_info "GAH is already installed"
        return 0
    fi

    log_info "Installing GAH (GitHub Apt Helper)..."

    # Install GAH
    if bash -c "$(curl -fsSL https://raw.githubusercontent.com/marverix/gah/refs/heads/master/tools/install.sh)"; then
        # Ensure ~/.local/bin is in PATH for current session
        export PATH="$HOME/.local/bin:$PATH"
        log_success "GAH installed successfully"
    else
        log_warning "GAH installation failed, falling back to manual installations"
        return 1
    fi
}

# Install lazygit
install_lazygit() {
    log_info "Installing lazygit..."

    case $PKG_MANAGER in
        "apt")
            # Check if lazygit is available in official repositories
            if apt-cache show lazygit &> /dev/null; then
                pkg_install lazygit
            else
                # Try installing via GAH first (no sudo required)
                if command -v gah &> /dev/null; then
                    log_info "Installing lazygit via GAH..."
                    if gah install lazygit --unattended; then
                        log_success "lazygit installed via GAH"
                        return 0
                    else
                        log_warning "GAH installation failed, trying PPA..."
                    fi
                fi

                # Fallback to PPA for older Ubuntu versions
                log_info "Adding lazygit PPA..."
                sudo add-apt-repository ppa:lazygit-team/release -y
                if ! sudo apt update; then
                    log_warning "Package update had issues, but continuing..."
                fi
                sudo apt install lazygit -y
            fi
            ;;
        "dnf")
            log_info "Enabling lazygit Copr repository..."
            sudo dnf copr enable atim/lazygit -y
            pkg_install lazygit
            ;;
        "pacman")
            # lazygit is available in official Arch repositories
            pkg_install lazygit
            ;;
        "zypper")
            log_info "Adding devel:languages:go repository..."
            sudo zypper ar https://download.opensuse.org/repositories/devel:/languages:/go/openSUSE_Factory/devel:languages:go.repo
            sudo zypper ref
            sudo zypper in -y lazygit
            ;;
        "brew")
            pkg_install lazygit
            ;;
    esac

    log_success "lazygit installed"
}

# Install jujutsu (jj) version control system
install_jujutsu() {
    if command -v jj &> /dev/null; then
        log_info "Jujutsu (jj) is already installed"
        return 0
    fi

    log_info "Installing Jujutsu (jj) version control system..."

    case $PKG_MANAGER in
        "apt")
            # Use the official install script for Ubuntu/Debian
            log_info "Installing jj via pre-built binary..."
            
            # Create temporary directory
            local temp_dir=$(mktemp -d)
            cd "$temp_dir"
            
            # Download latest release
            local arch=$(uname -m)
            local os="unknown-linux-musl"
            if [[ "$arch" == "x86_64" ]]; then
                arch="x86_64"
            elif [[ "$arch" == "aarch64" ]]; then
                arch="aarch64"
            else
                log_error "Unsupported architecture: $arch"
                return 1
            fi
            
            local download_url="https://github.com/jj-vcs/jj/releases/latest/download/jj-v*-${arch}-${os}.tar.gz"
            
            # Use GitHub API to get latest release
            local latest_url=$(curl -s https://api.github.com/repos/jj-vcs/jj/releases/latest | jq -r ".assets[] | select(.name | contains(\"${arch}-${os}\")) | .browser_download_url")
            
            if [[ -z "$latest_url" ]]; then
                log_error "Could not find download URL for jujutsu"
                return 1
            fi
            
            curl -L -o jj.tar.gz "$latest_url"
            tar -xzf jj.tar.gz
            
            # Install to ~/.local/bin
            mkdir -p "$HOME/.local/bin"
            mv jj "$HOME/.local/bin/"
            chmod +x "$HOME/.local/bin/jj"
            
            # Cleanup
            cd - > /dev/null
            rm -rf "$temp_dir"
            ;;
        "dnf"|"pacman"|"zypper")
            # For other package managers, try cargo installation
            log_info "Installing jj via cargo..."
            if command -v cargo &> /dev/null; then
                cargo install --git https://github.com/jj-vcs/jj.git --locked --bin jj jj-cli
            else
                log_error "Cargo not found. Please install Rust first."
                return 1
            fi
            ;;
        "brew")
            pkg_install jj
            ;;
    esac

    # Ensure ~/.local/bin is in PATH
    export PATH="$HOME/.local/bin:$PATH"
    
    if command -v jj &> /dev/null; then
        log_success "Jujutsu (jj) installed successfully"
        log_info "Run 'jj config set --user user.name \"Your Name\"' to configure your name"
        log_info "Run 'jj config set --user user.email \"your.email@example.com\"' to configure your email"
    else
        log_error "Jujutsu installation verification failed"
        return 1
    fi
}

# Main function to install all git tools
install_git_tools() {
    install_gah
    install_lazygit
    install_jujutsu
}
