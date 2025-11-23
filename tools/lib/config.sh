#!/usr/bin/env bash
# Dependencies: utils.sh (logging)
# Note: SCRIPT_DIR should be set by the calling script (install.sh)

# Set up configuration files
setup_configs() {
    log_info "Setting up configuration files..."

    local DOTFILES_DIR="${DOTFILES_DIR:-$SCRIPT_DIR}"

    # Set up Starship config
    if [ -f "$DOTFILES_DIR/starship.toml" ]; then
        mkdir -p ~/.config
        ln -sf "$DOTFILES_DIR/starship.toml" ~/.config/starship.toml
        log_success "Starship config linked"
    fi

    # Set up Fish config
    if [ -d "$DOTFILES_DIR/fish" ]; then
        mkdir -p ~/.config/fish
        # Remove existing symlink or directory if it's a full link
        if [ -L ~/.config/fish ] && [ "$(readlink ~/.config/fish)" = "$DOTFILES_DIR/fish" ]; then
            rm ~/.config/fish
        fi

        # Link all .fish files from the fish directory
        for fish_file in "$DOTFILES_DIR"/fish/*.fish; do
            if [ -f "$fish_file" ]; then
                local filename=$(basename "$fish_file")
                ln -sf "$fish_file" ~/.config/fish/"$filename"
                log_success "Fish $filename linked"
            fi
        done

        # Link functions directory if it exists
        if [ -d "$DOTFILES_DIR/fish/functions" ]; then
            ln -sf "$DOTFILES_DIR/fish/functions" ~/.config/fish/functions
            log_success "Fish functions directory linked"
        fi
    fi

    # Set up Neovim config
    if [ -d "$DOTFILES_DIR/nvim" ]; then
        if [ -d ~/.config/nvim ] && [ ! -L ~/.config/nvim ]; then
            log_warning "Backing up existing Neovim config to ~/.config/nvim.backup"
            mv ~/.config/nvim ~/.config/nvim.backup
        elif [ -L ~/.config/nvim ]; then
            rm ~/.config/nvim
        fi
        ln -sf "$DOTFILES_DIR/nvim" ~/.config/nvim
        log_success "Neovim config linked"
    fi

    # Set up mise config
    if [ -f "$DOTFILES_DIR/.mise.toml" ]; then
        mkdir -p ~/.config/mise
        ln -sf "$DOTFILES_DIR/.mise.toml" ~/.config/mise/config.toml
        log_success "Mise config linked"
    fi

    # Set up Ghostty config
    if [ -d "$DOTFILES_DIR/ghostty" ]; then
        mkdir -p ~/.config/ghostty
        if [ -f "$DOTFILES_DIR/ghostty/config" ]; then
            ln -sf "$DOTFILES_DIR/ghostty/config" ~/.config/ghostty/config
            log_success "Ghostty config linked"
        fi
    fi

    # Set up tmux config
    if [ -d "$DOTFILES_DIR/tmux" ]; then
        if [ -L ~/.config/tmux ]; then
            rm ~/.config/tmux
        elif [ -d ~/.config/tmux ] && [ ! -L ~/.config/tmux ]; then
            log_warning "Backing up existing tmux config to ~/.config/tmux.backup"
            mv ~/.config/tmux ~/.config/tmux.backup
        fi
        ln -sf "$DOTFILES_DIR/tmux" ~/.config/tmux
        log_success "tmux config linked"
    fi

    # Set up WezTerm config
    if [ -d "$DOTFILES_DIR/wezterm" ]; then
        if [ -L ~/.config/wezterm ]; then
            rm ~/.config/wezterm
        elif [ -d ~/.config/wezterm ] && [ ! -L ~/.config/wezterm ]; then
            log_warning "Backing up existing WezTerm config to ~/.config/wezterm.backup"
            mv ~/.config/wezterm ~/.config/wezterm.backup
        fi
        ln -sf "$DOTFILES_DIR/wezterm" ~/.config/wezterm
        log_success "WezTerm config linked"
    fi

    # Set up Zellij config
    if [ -d "$DOTFILES_DIR/zellij" ]; then
        if [ -L ~/.config/zellij ]; then
            rm ~/.config/zellij
        elif [ -d ~/.config/zellij ] && [ ! -L ~/.config/zellij ]; then
            log_warning "Backing up existing Zellij config to ~/.config/zellij.backup"
            mv ~/.config/zellij ~/.config/zellij.backup
        fi
        ln -sf "$DOTFILES_DIR/zellij" ~/.config/zellij
        log_success "Zellij config linked"
    fi

    # Set up Hyprland config if available
    if [ -d "$DOTFILES_DIR/hypr" ]; then
        if [ -L ~/.config/hypr ]; then
            rm ~/.config/hypr
        elif [ -d ~/.config/hypr ] && [ ! -L ~/.config/hypr ]; then
            log_warning "Backing up existing Hyprland config to ~/.config/hypr.backup"
            mv ~/.config/hypr ~/.config/hypr.backup
        fi
        ln -sf "$DOTFILES_DIR/hypr" ~/.config/hypr
        log_success "Hyprland config linked"
    fi
}

# Add shell integrations
setup_shell_integrations() {
    log_info "Setting up shell integrations..."

    # Add Fish to /etc/shells if not already there
    if command -v fish &> /dev/null; then
        FISH_PATH=$(which fish)
        if ! grep -q "$FISH_PATH" /etc/shells; then
            echo "$FISH_PATH" | sudo tee -a /etc/shells
        fi
    fi

    log_success "Shell integrations set up"
}
