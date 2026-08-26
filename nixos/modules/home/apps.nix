# Apps de desktop: Firefox (declarativo) + Proton Pass
# Firefox: extensões e preferências versionadas; login/sync continua manual (1x).
{ pkgs, ... }:
let
  # Hashes baixados do addons.mozilla.org em 2026-08 — atualize junto com o Firefox
  ublock-origin = pkgs.fetchFirefoxAddon {
    name = "ublock-origin";
    url = "https://addons.mozilla.org/firefox/downloads/file/4981431/ublock_origin-1.74.0.xpi";
    sha256 = "sha256-F1dW10RoybpFhj9/wzPTvmcPgtWwZjFOkVgU3VR9FlI=";
  };
  proton-pass = pkgs.fetchFirefoxAddon {
    name = "proton-pass";
    url = "https://addons.mozilla.org/firefox/downloads/file/4885390/proton_pass-1.38.0.xpi";
    sha256 = "sha256-IluWNgtRt3VrJhVDIhT8D02T6cMDCrSoZLHgeCbu+ds=";
  };
  # Tema do Firefox que segue a paleta do Noctalia (template oficial do projeto)
  pywalfox = pkgs.fetchFirefoxAddon {
    name = "pywalfox";
    url = "https://addons.mozilla.org/firefox/downloads/file/4834767/pywalfox-2.1.1.xpi";
    sha256 = "sha256-t6eobR1JqDCXWM4dOEkpdavgemHjeI4tkTxwpNB3WLQ=";
  };
in
{
  home.packages = with pkgs; [
    proton-pass     # app desktop do Proton Pass (Linux)
    obsidian        # notas — template de tema disponível no Noctalia
    ankama-launcher # jogos Ankama (Dofus, Waven, Wakfu…) — AppImage + wine via nixpkgs
  ];

  # Player de vídeo com aceleração de hardware na RX 7600 (VAAPI)
  programs.mpv = {
    enable = true;
    config = {
      hwdec = "auto-safe";
      vo = "gpu";
    };
  };

  programs.firefox = {
    enable = true;
    languagePacks = [ "pt-BR" ];

    # Políticas (policies.json) — valem para todos os perfis
    policies = {
      DisableTelemetry = true;
      DisableFirefoxStudies = true;
      DisablePocket = true;
      DisableFormHistory = true;
      DontCheckDefaultBrowser = true;
      PasswordManagerEnabled = false; # o Proton Pass é o gerenciador
    };

    profiles.lafco = {
      id = 0;
      name = "lafco";
      isDefault = true;

      search = {
        force = true;
        default = "DuckDuckGo";
        privateDefault = "DuckDuckGo";
      };

      settings = {
        "widget.use-xdg-desktop-portal.file-picker" = 1; # file picker via portal (niri)
        "browser.toolbars.bookmarks.visibility" = "never";
        "extensions.pocket.enabled" = false;
        "browser.startup.homepage" = "about:home";
      };

      extensions.packages = [ ublock-origin proton-pass pywalfox ];
    };
  };
}
