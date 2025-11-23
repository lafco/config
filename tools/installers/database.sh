#!/usr/bin/env bash
# Dependencies: utils.sh (logging), system.sh (OS, PKG_MANAGER, INSTALL_CMD)

install_database() {
    log_info "Installing PostgreSQL..."

    case $PKG_MANAGER in
        "apt")
            pkg_install postgresql postgresql-contrib
            # Start and enable PostgreSQL service
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        "dnf")
            pkg_install postgresql postgresql-server postgresql-contrib
            # Initialize database and start service
            sudo postgresql-setup --initdb
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        "pacman")
            pkg_install postgresql
            # Initialize database
            sudo -u postgres initdb -D /var/lib/postgres/data
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        "zypper")
            pkg_install postgresql postgresql-server postgresql-contrib
            # Initialize database and start service
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        "brew")
            pkg_install postgresql
            # Start PostgreSQL service
            brew services start postgresql
            ;;
    esac

    # Create a database user with the same name as the current user
    if [[ "$OS" != "macos" ]]; then
        log_info "Creating PostgreSQL user: $USER"
        sudo -u postgres createuser --superuser $USER 2>/dev/null || log_warning "User $USER already exists in PostgreSQL"
        sudo -u postgres createdb $USER 2>/dev/null || log_warning "Database $USER already exists"
    else
        log_info "Creating PostgreSQL user: $USER"
        createuser --superuser $USER 2>/dev/null || log_warning "User $USER already exists in PostgreSQL"
        createdb $USER 2>/dev/null || log_warning "Database $USER already exists"
    fi

    log_success "PostgreSQL installed and configured"
    log_info "You can connect to PostgreSQL with: psql"
}
