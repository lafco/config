{ pkgs, ... }:
{
  languages.javascript = {
    enable = true;
    corepack.enable = true; # yarn/pnpm via corepack
    npm.enable = true;
  };

  packages = with pkgs; [ ripgrep fd git ];

  enterShell = ''
    echo "🚀 devenv node — $(node -v) / npm $(npm -v)"
  '';
}
