#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

install_runtimes() {
    log_info "Installing development runtimes..."

    # Install mise (formerly rtx)
    if ! command -v mise &> /dev/null && [ ! -f "$HOME/.local/bin/mise" ]; then
        log_info "Installing mise..."
        curl https://mise.run | sh
        # Add mise activation to shell profiles
        if [ -f ~/.bashrc ] && ! grep -q "mise activate" ~/.bashrc; then
            echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
        fi
        if [ -f ~/.zshrc ] && ! grep -q "mise activate" ~/.zshrc; then
            echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
        fi
        # Give mise a moment to finish installation
        sleep 2
    fi

    # Ensure mise is in PATH
    export PATH="$HOME/.local/bin:$PATH"

    # Install Rust
    if ! command -v rustc &> /dev/null; then
        log_info "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source ~/.cargo/env
    fi

    # Check if mise is available
    if [ -f "$HOME/.local/bin/mise" ]; then
        MISE_CMD="$HOME/.local/bin/mise"
        log_info "Found mise at: $MISE_CMD"
    elif command -v mise &> /dev/null; then
        MISE_CMD="mise"
        log_info "Found mise in PATH: $(which mise)"
    else
        log_error "mise installation failed, skipping runtime installation"
        log_info "Checked: $HOME/.local/bin/mise and PATH"
        return
    fi

    # Verify mise is executable
    if ! "$MISE_CMD" --version &> /dev/null; then
        log_error "mise command failed, skipping runtime installation"
        return
    fi

    # Install Node.js via mise
    log_info "Installing Node.js LTS via mise..."
    if "$MISE_CMD" install node@lts; then
        "$MISE_CMD" global node@lts || log_warning "Failed to set Node.js as global"
        log_success "Node.js LTS installed"
    else
        log_warning "Failed to install Node.js"
    fi

    # Install Python via mise
    log_info "Installing Python latest via mise..."
    if "$MISE_CMD" install python@latest; then
        "$MISE_CMD" global python@latest || log_warning "Failed to set Python as global"
        log_success "Python latest installed"
    else
        log_warning "Failed to install Python"
    fi

    log_success "Development runtimes installed"
}
