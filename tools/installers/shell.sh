#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

# Install atuin (enhanced shell history)
install_atuin() {
    if command -v atuin &> /dev/null; then
        log_info "Atuin is already installed"
        return 0
    fi

    log_info "Installing atuin enhanced shell history..."

    # Try official installation script first (most reliable)
    if bash <(curl --proto '=https' --tlsv1.2 -sSf https://setup.atuin.sh); then
        # Ensure ~/.local/bin is in PATH for current session
        export PATH="$HOME/.local/bin:$PATH"
        log_success "Atuin installed via official script"
    else
        log_warning "Official script failed, trying package managers..."
        
        case $PKG_MANAGER in
            "brew")
                if pkg_install atuin; then
                    log_success "Atuin installed via brew"
                else
                    log_error "Brew installation failed"
                    return 1
                fi
                ;;
            "pacman")
                # Try AUR if available
                if command -v paru &> /dev/null; then
                    if paru -S atuin; then
                        log_success "Atuin installed via AUR"
                    else
                        log_error "AUR installation failed"
                        return 1
                    fi
                elif command -v yay &> /dev/null; then
                    if yay -S atuin; then
                        log_success "Atuin installed via AUR"
                    else
                        log_error "AUR installation failed"
                        return 1
                    fi
                else
                    log_error "No AUR helper found (paru/yay required)"
                    return 1
                fi
                ;;
            "apt"|"dnf"|"zypper")
                # Try cargo installation as fallback
                if command -v cargo &> /dev/null; then
                    log_info "Installing atuin via cargo..."
                    cargo install atuin
                    log_success "Atuin installed via cargo"
                else
                    log_error "Cargo not found. Please install Rust first or use the official script."
                    return 1
                fi
                ;;
            *)
                log_error "Unsupported package manager for atuin"
                return 1
                ;;
        esac
    fi

    # Verify installation
    if command -v atuin &> /dev/null; then
        log_info "Setting up shell integrations for atuin..."
        
        # Setup shell integrations
        # Fish shell integration
        if command -v fish &> /dev/null; then
            log_info "Setting up atuin for Fish shell..."
            fish -c "atuin init fish | source" 2>/dev/null || true
        fi
        
        # Bash shell integration  
        if [[ -f "$HOME/.bashrc" ]]; then
            log_info "Setting up atuin for Bash shell..."
            if ! grep -q "atuin init bash" "$HOME/.bashrc"; then
                echo 'eval "$(atuin init bash)"' >> "$HOME/.bashrc"
            fi
        fi
        
        # Zsh shell integration
        if [[ -f "$HOME/.zshrc" ]]; then
            log_info "Setting up atuin for Zsh shell..."
            if ! grep -q "atuin init zsh" "$HOME/.zshrc"; then
                echo 'eval "$(atuin init zsh)"' >> "$HOME/.zshrc"
            fi
        fi
        
        # Nushell integration (handled in env.nu)
        if command -v nu &> /dev/null; then
            log_info "Nushell integration for atuin is handled in nushell/env.nu"
        fi
        
        log_success "Atuin shell integrations configured"
        log_info "Run 'atuin register' to create an account and sync history"
        log_info "Run 'atuin import auto' to import existing shell history"
    else
        log_error "Atuin installation verification failed"
        return 1
    fi
}

install_shell() {
    log_info "Installing modern shell tools..."

    case $PKG_MANAGER in
        "apt")
            # Install GAH for GitHub releases
            install_gah

            # Install from repositories where available
            pkg_install ripgrep fd-find bat eza fish

            # Install tools via GAH if available
            if command -v gah &> /dev/null; then
                log_info "Installing zoxide via GAH..."
                gah install zoxide --unattended || curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash

                log_info "Installing fzf via GAH..."
                gah install fzf --unattended || (git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && ~/.fzf/install --all)

                log_info "Installing gh via GAH..."
                gah install gh --unattended
            else
                # Fallback to manual installation
                curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash
                git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && ~/.fzf/install --all
            fi
            ;;
        "dnf")
            pkg_install ripgrep fd-find bat eza fish zoxide
            ;;
        "pacman")
            pkg_install ripgrep fd bat eza fish zoxide fzf
            ;;
        "zypper")
            pkg_install ripgrep fd bat fish
            # Install zoxide manually
            curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash
            ;;
        "brew")
            pkg_install ripgrep fd bat eza fish zoxide fzf gh
            ;;
    esac

    # Install fzf if not available through package manager
    if ! command -v fzf &> /dev/null && [[ "$PKG_MANAGER" != "apt" ]]; then
        log_info "Installing fzf..."
        git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
        ~/.fzf/install --all
    fi

    # Install GitHub CLI if not available
    if ! command -v gh &> /dev/null && [[ "$PKG_MANAGER" != "apt" ]]; then
        case $PKG_MANAGER in
            "dnf")
                sudo dnf install gh
                ;;
            "pacman")
                sudo pacman -S github-cli
                ;;
        esac
    fi

    # Install atuin
    install_atuin

    log_success "Shell tools installed"
}