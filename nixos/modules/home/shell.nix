# Shell: bash + ferramentas TUI (ex-mise)
# Os inits (starship, zoxide, atuin, tv) já estão em bash/.bashrc do repo.
{ pkgs, ... }:
{
  home.packages = with pkgs; [
    # prompt + navegação
    starship
    zoxide
    atuin
    television

    # cat/ls/find/grep modernos
    bat
    eza
    fd
    ripgrep

    # sistema
    btop

    # usados por bash/.functions e bash/.aliases
    jq
    lsof

    # devenv + direnv (ambientes por projeto)
    direnv
    nix-direnv
  ];

  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };
}
