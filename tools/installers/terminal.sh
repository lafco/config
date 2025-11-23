#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

# Install tmux
install_tmux() {
    log_info "Installing tmux..."

    case $PKG_MANAGER in
        "apt"|"dnf"|"pacman"|"zypper")
            pkg_install tmux
            ;;
        "brew")
            pkg_install tmux
            ;;
    esac

    log_success "tmux installed"
}

# Install WezTerm
install_wezterm() {
    log_info "Installing WezTerm..."

    case $PKG_MANAGER in
        "apt")
            log_info "Installing WezTerm AppImage..."
            curl -LO https://github.com/wez/wezterm/releases/download/nightly/WezTerm-nightly-Ubuntu20.04.AppImage
            chmod u+x WezTerm-nightly-Ubuntu20.04.AppImage
            sudo mkdir -p /usr/local/bin
            sudo mv WezTerm-nightly-Ubuntu20.04.AppImage /usr/local/bin/wezterm

            # Extract icon from AppImage
            log_info "Extracting WezTerm icon..."
            mkdir -p ~/.local/share/icons/hicolor/128x128/apps
            /usr/local/bin/wezterm --extract-icon > ~/.local/share/icons/hicolor/128x128/apps/wezterm.png 2>/dev/null || \
                curl -L -o ~/.local/share/icons/hicolor/128x128/apps/wezterm.png https://raw.githubusercontent.com/wez/wezterm/main/assets/icon/terminal.png

            # Create desktop entry
            log_info "Creating desktop entry..."
            mkdir -p ~/.local/share/applications
            cat > ~/.local/share/applications/wezterm.desktop <<EOF
[Desktop Entry]
Name=WezTerm
Comment=Wez's Terminal Emulator
Exec=/usr/local/bin/wezterm start
Icon=wezterm
Type=Application
Categories=System;TerminalEmulator;
Terminal=false
StartupNotify=true
EOF
            chmod +x ~/.local/share/applications/wezterm.desktop

            # Update desktop database
            if command -v update-desktop-database &> /dev/null; then
                update-desktop-database ~/.local/share/applications
            fi
            ;;
        "dnf")
            log_info "Installing WezTerm from Copr..."
            sudo dnf copr enable wezfurlong/wezterm-nightly -y
            pkg_install wezterm
            ;;
        "pacman")
            # WezTerm is available in the AUR and community repos
            pkg_install wezterm
            ;;
        "zypper")
            log_warning "WezTerm installation on openSUSE requires manual download"
            log_info "Visit: https://wezfurlong.org/wezterm/install/linux.html"
            ;;
        "brew")
            pkg_install --cask wezterm
            ;;
    esac

    log_success "WezTerm installed"
}

# Install Zellij
install_zellij() {
    log_info "Installing Zellij..."

    case $PKG_MANAGER in
        "apt"|"dnf"|"zypper")
            log_info "Installing Zellij from GitHub releases..."
            # Get latest release
            ZELLIJ_VERSION=$(curl -s https://api.github.com/repos/zellij-org/zellij/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
            ARCH=$(uname -m)
            case $ARCH in
                "x86_64") ZELLIJ_ARCH="x86_64-unknown-linux-musl" ;;
                "aarch64") ZELLIJ_ARCH="aarch64-unknown-linux-musl" ;;
                *) log_error "Unsupported architecture: $ARCH"; return 1 ;;
            esac
            
            # Create temporary directory to avoid conflicts
            TEMP_DIR=$(mktemp -d)
            cd "$TEMP_DIR"
            
            curl -L "https://github.com/zellij-org/zellij/releases/download/${ZELLIJ_VERSION}/zellij-${ZELLIJ_ARCH}.tar.gz" -o zellij.tar.gz
            tar -xzf zellij.tar.gz
            
            # Install to user's local bin directory
            mkdir -p ~/.local/bin
            mv zellij ~/.local/bin/
            
            # Clean up
            cd - > /dev/null
            rm -rf "$TEMP_DIR"
            
            # Add ~/.local/bin to PATH if not already there
            if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
                log_info "Adding ~/.local/bin to PATH..."
                
                # Add to bashrc for bash users
                echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
                
                # Add to fish config if fish is available
                if command -v fish &> /dev/null; then
                    mkdir -p ~/.config/fish
                    echo 'set -gx PATH $HOME/.local/bin $PATH' >> ~/.config/fish/config.fish
                    log_info "Added ~/.local/bin to fish PATH"
                fi
                
                export PATH="$HOME/.local/bin:$PATH"
            fi
            ;;
        "pacman")
            pkg_install zellij
            ;;
        "brew")
            pkg_install zellij
            ;;
    esac

    log_success "Zellij installed"
}

# Main function to install all terminal tools
install_terminal() {
    install_tmux
    install_wezterm
    install_zellij
}
