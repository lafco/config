# Editor: neovim (LazyVim) + runtimes que os plugins esperam no PATH
{ pkgs, ... }:
{
  home.packages = with pkgs; [
    neovim
    nodejs_22 # copilot, typescript-language-server etc.
    python3   # LSPs de python
    gcc       # nvim-treesitter compila parsers em C
  ];
}
