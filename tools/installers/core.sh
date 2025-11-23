#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (PKG_MANAGER, INSTALL_CMD)

install_core() {
    log_info "Installing core development tools..."

    case $PKG_MANAGER in
        "apt")
            # Package lists already updated in detect_and_fix_broken_ppas
            pkg_install curl wget git tree htop unzip jq build-essential
            ;;
        "dnf")
            $UPDATE_CMD
            pkg_install curl wget git tree htop unzip jq gcc gcc-c++ make
            ;;
        "pacman")
            $UPDATE_CMD
            pkg_install curl wget git tree htop unzip jq base-devel
            ;;
        "zypper")
            $UPDATE_CMD
            pkg_install curl wget git tree htop unzip jq gcc gcc-c++ make
            ;;
        "brew")
            $UPDATE_CMD
            pkg_install curl wget git tree htop jq
            ;;
    esac

    log_success "Core tools installed"
}
