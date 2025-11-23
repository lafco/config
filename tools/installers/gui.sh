#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

install_gui() {
    log_info "Installing GUI applications..."

    case $PKG_MANAGER in
        "apt")
            log_info "Installing Neovim..."
            curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.appimage
            chmod u+x nvim-linux-x86_64.appimage
            sudo mv nvim-linux-x86_64.appimage /usr/local/bin/nvim
            ;;
        "dnf")
            pkg_install neovim
            ;;
        "pacman")
            pkg_install neovim
            ;;
        "zypper")
            pkg_install neovim
            ;;
        "brew")
            pkg_install neovim
            ;;
    esac

    # Install Starship prompt
    if ! command -v starship &> /dev/null; then
        log_info "Installing Starship..."
        curl -sS https://starship.rs/install.sh | sh -s -- -y
    fi

    log_success "GUI applications installed"
}
