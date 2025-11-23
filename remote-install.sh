#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/lafco/dotfiles.git"
DOTFILES_DIR="$HOME/.dotfiles"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Clone or update dotfiles repository
setup_dotfiles_repo() {
    log_info "Setting up dotfiles repository..."
    
    if [ -d "$DOTFILES_DIR" ]; then
        log_info "Dotfiles directory exists, updating..."
        cd "$DOTFILES_DIR"
        git pull origin main || git pull origin master
    else
        log_info "Cloning dotfiles repository..."
        git clone "$REPO_URL" "$DOTFILES_DIR"
        cd "$DOTFILES_DIR"
    fi
    
    log_success "Dotfiles repository ready at $DOTFILES_DIR"
}

# Check if git is available, install if needed
ensure_git() {
    if ! command -v git &> /dev/null; then
        log_info "Git not found, installing..."
        
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command -v apt &> /dev/null; then
                sudo apt update && sudo apt install -y git
            elif command -v dnf &> /dev/null; then
                sudo dnf install -y git
            elif command -v pacman &> /dev/null; then
                sudo pacman -S --noconfirm git
            elif command -v zypper &> /dev/null; then
                sudo zypper install -y git
            else
                log_error "Unable to install git automatically. Please install git manually."
                exit 1
            fi
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # Check if Homebrew is available
            if ! command -v brew &> /dev/null; then
                log_info "Installing Homebrew first..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install git
        else
            log_error "Unsupported operating system. Please install git manually."
            exit 1
        fi
        
        log_success "Git installed successfully"
    fi
}

# Main installation function
main() {
    log_info "Starting dotfiles installation..."
    
    # Check if we're already in the dotfiles directory
    log_info "Running remote installation..."
    echo "Repository: $REPO_URL"
    echo "Install directory: $DOTFILES_DIR"
    echo ""
    
    # Ensure git is available
    ensure_git
    
    # Setup dotfiles repository
    setup_dotfiles_repo
    
    # Run the main installation script
    log_info "Running main installation script..."
    cd "$DOTFILES_DIR"
    chmod +x install.sh
    ./install.sh -q
    
    echo ""
    log_success "Remote installation complete!"
    echo ""
    echo "📁 Dotfiles installed to: $DOTFILES_DIR"
    echo "🔧 Configuration files linked to ~/.config/"
    echo ""
    echo "To update in the future:"
    echo "  cd $DOTFILES_DIR && git pull && ./install.sh"
    echo ""
    echo "Or run the remote installer again:"
    echo "  curl -fsSL https://raw.githubusercontent.com/lafco/dotfiles/main/install.sh | bash"
}

# Run main function
main "$@"
