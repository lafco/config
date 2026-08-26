{ pkgs, ... }:
{
  languages.rust = {
    enable = true;
    channel = "stable";
    components = [ "rustfmt" "clippy" ];
  };

  packages = with pkgs; [ cargo-watch ripgrep fd git ];

  enterShell = ''
    echo "🚀 devenv rust — $(rustc --version)"
  '';
}
