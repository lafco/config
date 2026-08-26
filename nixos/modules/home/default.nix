# Home Manager — usuário lafco
{ pkgs, inputs, ... }:
{
  imports = [
    ./dotfiles.nix
    ./shell.nix
    ./git.nix
    ./editor.nix
    ./terminal.nix
    ./ai.nix
    ./apps.nix
  ];

  home = {
    username = "lafco";
    homeDirectory = "/home/lafco";
    stateVersion = "25.11";
  };

  home.packages = [
    # CLI do devenv direto do flake — sempre em sync com os templates em ./devenv
    inputs.devenv.packages.${pkgs.stdenv.hostPlatform.system}.devenv
  ];
}
