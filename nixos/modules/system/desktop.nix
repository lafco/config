# Desktop: niri (Wayland, tiling rolável) + Noctalia shell + greetd com autologin
# Base niri: https://wiki.nixos.org/wiki/Niri
# Integração Noctalia: https://docs.noctalia.dev/noctalia/compositor-settings/niri/
{ config, pkgs, ... }:
{
  programs.niri.enable = true;

  # greetd inicia o niri direto, sem display manager pesado
  services.greetd = {
    enable = true;
    settings.default_session = {
      command = "${config.programs.niri.package}/bin/niri-session";
      user = "lafco";
    };
  };

  # Deixa o niri herdar o PATH completo do usuário
  systemd.user.services.niri.enableDefaultPath = false;

  security.polkit.enable = true;
  services.gnome.gnome-keyring.enable = true;

  # Serviços exigidos pelo Noctalia (bateria, perfis de energia, rede, bluetooth)
  services.upower.enable = true;
  services.power-profiles-daemon.enable = true;

  # Noctalia substitui: waybar (barra), mako (notificações), swayidle (idle),
  # swaylock (lock) e swaybg (wallpaper). Só existe no unstable (overlay pkgs.unstable).
  environment.systemPackages = with pkgs; [
    unstable.noctalia

    fuzzel             # launcher leve de fallback (Mod+D)
    xwayland-satellite # apps X11 (Steam etc.)
    playerctl          # teclas de mídia
  ];

  # Portals: diálogos de arquivo (gtk) + screencast/screenshot (gnome)
  xdg.portal = {
    enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-gtk
      xdg-desktop-portal-gnome
    ];
    config.common.default = [ "gtk" ];
  };

  # Electron/Chromium nativos no Wayland — descomente se precisar:
  # environment.sessionVariables.NIXOS_OZONE_WL = "1";
}
