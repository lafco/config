# GitHub CLI aliases

if type -q gh
    # General GitHub CLI alias
    alias ghl 'gh auth login'

    # Repository operations
    alias ghv 'gh repo view'
    alias ghvc 'gh repo view --web'
    alias ghc 'gh repo clone'
    alias ghcr 'gh repo create'

    # Pull request operations
    alias ghpr 'gh pr list'
    alias ghprc 'gh pr create'
    alias ghprv 'gh pr view'
    alias ghprco 'gh pr checkout'
    alias ghprm 'gh pr merge'

    # Issue operations
    alias ghi 'gh issue list'
    alias ghic 'gh issue create'
    alias ghiv 'gh issue view'

    # Workflow operations
    alias ghw 'gh workflow list'
    alias ghwr 'gh workflow run'
    alias ghwv 'gh workflow view'

    # Other operations
    alias ghs 'gh status'
    alias ghrl 'gh release list'
    alias ghrc 'gh release create'
end
