# Nushell Environment File
# See full environment configuration reference at: https://www.nushell.sh/book/configuration.html

# Directories to search for plugin files
$env.NU_PLUGIN_DIRS = [
    ($nu.default-config-dir | path join 'plugins') # add <nushell-config-dir>/plugins
    # ($nu.data-dir | path join 'plugins') # add <nushell-data-dir>/plugins
]

# Directories to search for scripts when calling source or use
$env.NU_LIB_DIRS = [
    ($nu.default-config-dir | path join 'scripts') # add <nushell-config-dir>/scripts
    # ($nu.data-dir | path join 'scripts') # add <nushell-data-dir>/scripts
]

# Path configuration
$env.PATH = (
    $env.PATH | split row (char esep)
    | append ($env.HOME | path join ".local/bin")
    | append ($env.HOME | path join ".cargo/bin")
    | append "/usr/local/bin"
    | uniq # remove duplicates
)

# Editor configuration
$env.EDITOR = "nvim"
$env.VISUAL = "nvim"

# Language and locale
$env.LANG = "en_US.UTF-8"
$env.LC_ALL = "en_US.UTF-8"

# Less pager configuration
$env.LESS = "-R"
$env.LESSOPEN = "|/usr/bin/lesspipe %s"
$env.LESSCLOSE = "/usr/bin/lesspipe %s %s"

# Git configuration
$env.GIT_PAGER = "less -R"

# Node.js configuration (if using mise/asdf)
if (which mise | is-not-empty) {
    $env.MISE_SHELL = "nu"
    # Initialize mise if available
    ^mise activate nu | save --force ($nu.config-path | path dirname | path join mise.nu)
    source ($nu.config-path | path dirname | path join mise.nu)
}

# Zoxide configuration (smart cd replacement)
if (which zoxide | is-not-empty) {
    $env.ZOXIDE_CMD_OVERRIDE = "cd"
    zoxide init nushell | save --force ($nu.config-path | path dirname | path join zoxide.nu)
    source ($nu.config-path | path dirname | path join zoxide.nu)
}

# Atuin configuration (enhanced shell history)
if (which atuin | is-not-empty) {
    atuin init nu | save --force ($nu.config-path | path dirname | path join atuin.nu)
    source ($nu.config-path | path dirname | path join atuin.nu)
}

# Direnv configuration (if available)
if (which direnv | is-not-empty) {
    direnv hook nu | save --force ($nu.config-path | path dirname | path join direnv.nu)
    source ($nu.config-path | path dirname | path join direnv.nu)
}

# FZF configuration
if (which fzf | is-not-empty) {
    $env.FZF_DEFAULT_COMMAND = "fd --type f --hidden --follow --exclude .git"
    $env.FZF_CTRL_T_COMMAND = $env.FZF_DEFAULT_COMMAND
    $env.FZF_ALT_C_COMMAND = "fd --type d --hidden --follow --exclude .git"
    $env.FZF_DEFAULT_OPTS = "--height 40% --layout=reverse --border"
}

# Ripgrep configuration
if (which rg | is-not-empty) {
    $env.RIPGREP_CONFIG_PATH = ($env.HOME | path join ".ripgreprc")
}

# Bat configuration (syntax highlighting cat)
if (which bat | is-not-empty) {
    $env.BAT_THEME = "Sublime Snazzy"
    $env.BAT_PAGER = "less -RF"
}

# EZA configuration (modern ls replacement)
if (which eza | is-not-empty) {
    $env.EZA_COLORS = "di=1;34:ln=1;36:ex=1;32"
}

# Docker configuration
$env.DOCKER_BUILDKIT = "1"
$env.COMPOSE_DOCKER_CLI_BUILD = "1"

# Development environment variables
$env.CARGO_NET_GIT_FETCH_WITH_CLI = "true"