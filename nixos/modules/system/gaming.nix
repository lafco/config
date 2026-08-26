# Jogos: Steam + GameMode (GPU AMD com mesa/radv)
{ pkgs, ... }:
{
  programs.steam = {
    enable = true;
    remotePlay.openFirewall = true;
  };

  programs.gamemode.enable = true;

  environment.systemPackages = with pkgs; [
    mangohud  # overlay de FPS/temperaturas
    gamescope # microcompositor p/ jogos (opcional)
  ];
}
