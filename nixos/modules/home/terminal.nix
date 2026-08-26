# Terminal: wezterm + zellij + clipboard
{ pkgs, ... }:
{
  home.packages = with pkgs; [
    wezterm
    zellij

    # clipboard: Wayland (niri) e X11 (xwayland)
    wl-clipboard
    xclip
  ];
}
