#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

# Install OpenCode AI coding agent
install_opencode() {
    if command -v opencode &> /dev/null; then
        log_info "OpenCode is already installed"
        return 0
    fi

    log_info "Installing OpenCode AI coding agent..."

    # Try the official install script first (most reliable)
    if curl -fsSL https://opencode.ai/install | bash; then
        # Ensure ~/.local/bin is in PATH for current session
        export PATH="$HOME/.local/bin:$PATH"
        log_success "OpenCode installed via official script"
        log_info "Run 'opencode auth login' to authenticate with an AI provider"
        return 0
    fi

    log_warning "Official script failed, trying npm installation..."

    # Fallback to npm if available
    if command -v npm &> /dev/null; then
        if npm install -g opencode-ai; then
            log_success "OpenCode installed via npm"
            log_info "Run 'opencode auth login' to authenticate with an AI provider"
            return 0
        fi
    fi

    # Another fallback for systems with different package managers
    case $PKG_MANAGER in
        "brew")
            if pkg_install opencode; then
                log_success "OpenCode installed via brew"
                log_info "Run 'opencode auth login' to authenticate with an AI provider"
                return 0
            fi
            ;;
        "pacman")
            # Try AUR if available
            if command -v paru &> /dev/null; then
                if paru -S opencode-bin; then
                    log_success "OpenCode installed via AUR"
                    log_info "Run 'opencode auth login' to authenticate with an AI provider"
                    return 0
                fi
            fi
            ;;
    esac

    log_error "All OpenCode installation methods failed"
    log_info "You can try manual installation from: https://github.com/sst/opencode"
    return 1
}

# Install Claude Code CLI
install_claude_code() {
    if command -v claude &> /dev/null; then
        log_info "Claude Code is already installed"
        return 0
    fi

    log_info "Installing Claude Code CLI..."

    # Try the official install script first (recommended)
    if curl -fsSL https://claude.ai/install.sh | bash; then
        # Ensure ~/.local/bin is in PATH for current session
        export PATH="$HOME/.local/bin:$PATH"
        log_success "Claude Code installed via official script"
        log_info "Run 'claude' to start and authenticate with your Anthropic account"
        return 0
    fi

    log_warning "Official script failed, trying npm installation..."

    # Fallback to npm if available
    if command -v npm &> /dev/null; then
        # Check Node.js version
        node_version=$(node --version 2>/dev/null | sed 's/v//')
        required_version="18.0.0"
        
        if command -v node &> /dev/null && [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" = "$required_version" ]; then
            # Configure npm for user-level installation if not already configured
            if ! npm config get prefix | grep -q "$HOME/.npm-global"; then
                log_info "Configuring npm for user-level installation..."
                mkdir -p ~/.npm-global
                npm config set prefix ~/.npm-global
                export PATH="$HOME/.npm-global/bin:$PATH"
                
                # Add to shell configs if not already present
                for shell_config in "$HOME/.bashrc" "$HOME/.zshrc"; do
                    if [[ -f "$shell_config" ]] && ! grep -q "npm-global" "$shell_config"; then
                        echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> "$shell_config"
                    fi
                done
            fi
            
            if npm install -g @anthropic-ai/claude-code; then
                log_success "Claude Code installed via npm"
                log_info "Run 'claude doctor' to verify installation"
                log_info "Run 'claude' to start and authenticate with your Anthropic account"
                return 0
            fi
        else
            log_warning "Node.js 18+ required for npm installation. Current version: $node_version"
            log_info "Install Node.js 20+ first: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
        fi
    fi

    # Another fallback for systems with different package managers
    case $PKG_MANAGER in
        "brew")
            if brew install --cask claude-code; then
                log_success "Claude Code installed via brew"
                log_info "Run 'claude' to start and authenticate with your Anthropic account"
                return 0
            fi
            ;;
    esac

    log_error "All Claude Code installation methods failed"
    log_info "You can try manual installation from: https://claude.ai/install.sh"
    return 1
}

# Main function to install all AI tools
install_ai_tools() {
    install_opencode
    install_claude_code
}