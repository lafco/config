#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

install_system() {
    log_info "Installing additional system tools..."

    case $PKG_MANAGER in
        "apt")
            # btop might not be available in older Ubuntu versions
            if apt-cache show btop &> /dev/null; then
                pkg_install btop
            else
                log_warning "btop not available in repositories, skipping..."
            fi
            ;;
        "dnf"|"pacman"|"zypper")
            pkg_install btop
            ;;
        "brew")
            pkg_install btop
            ;;
    esac

    log_success "System tools installed"
}
