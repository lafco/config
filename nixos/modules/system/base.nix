# Base do sistema: nix, utilitários e fontes
{ pkgs, ... }:

{
  nix = {
    settings = {
      experimental-features = [ "nix-command" "flakes" ];
      auto-optimise-store = true;
    };
    gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
  };

  # Permite pacotes unfree (steam etc.)
  nixpkgs.config.allowUnfree = true;

  # Necessário para rodar binários de fora da store Nix
  # (ex.: LSPs baixados pelo Mason no LazyVim)
  programs.nix-ld.enable = true;

  environment.systemPackages = with pkgs; [
    git
    curl
    wget
    unzip
    gzip
    xz
    file
    htop
  ];

  # Fonte dos ícones (nvim, starship, wezterm, noctalia)
  fonts.packages = [ pkgs.nerd-fonts.jetbrains-mono ];
}
