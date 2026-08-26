# Agentes de IA: pi (pi.dev) + herdr
# Ambos só existem no nixpkgs-unstable — vêm do overlay em hosts/hmpc/default.nix
{ pkgs, ... }:
{
  home.packages = with pkgs; [
    unstable.pi-coding-agent # pi
    unstable.herdr           # AI workspace manager
  ];
}
