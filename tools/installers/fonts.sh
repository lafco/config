#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (OS)

install_fonts() {
    log_info "Installing fonts..."

    # Create fonts directory
    if [[ "$OS" == "macos" ]]; then
        FONT_DIR="$HOME/Library/Fonts"
    else
        FONT_DIR="$HOME/.local/share/fonts"
    fi

    mkdir -p "$FONT_DIR"

    # Download and install JetBrains Mono Nerd Font
    log_info "Installing JetBrains Mono Nerd Font..."
    FONT_URL="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip"
    TEMP_DIR=$(mktemp -d)

    curl -L -o "$TEMP_DIR/JetBrainsMono.zip" "$FONT_URL"
    unzip -q "$TEMP_DIR/JetBrainsMono.zip" -d "$TEMP_DIR"
    cp "$TEMP_DIR"/*.ttf "$FONT_DIR"

    # Download and install FiraCode Nerd Font
    log_info "Installing FiraCode Nerd Font..."
    FIRA_URL="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/FiraCode.zip"

    curl -L -o "$TEMP_DIR/FiraCode.zip" "$FIRA_URL"
    unzip -q "$TEMP_DIR/FiraCode.zip" -d "$TEMP_DIR/fira"
    cp "$TEMP_DIR/fira"/*.ttf "$FONT_DIR"

    # Refresh font cache on Linux
    if [[ "$OS" != "macos" ]]; then
        if command -v fc-cache &> /dev/null; then
            fc-cache -fv
        fi
    fi

    rm -rf "$TEMP_DIR"
    log_success "Fonts installed"
}
