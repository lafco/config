# Editor: neovim (LazyVim) + Zed (vim binds) + runtimes que os plugins esperam
{ pkgs, ... }:
{
  home.packages = with pkgs; [
    neovim
    nodejs_22 # copilot, typescript-language-server etc.
    python3   # LSPs de python
    gcc       # nvim-treesitter compila parsers em C

    # Zed (config em ~/dotfiles/zed/.config/zed, linkado pelo dotfiles.nix)
    zed-editor

    # LSPs/formatters usados pelo Zed (vêm do PATH, sem download do Zed)
    lua-language-server # lua
    stylua              # formatter lua
  ];
}
