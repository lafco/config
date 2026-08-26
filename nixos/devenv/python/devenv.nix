{ pkgs, ... }:
{
  languages.python = {
    enable = true;
    version = "3.12";
    venv.enable = true;
    uv.enable = true; # uv é o padrão moderno p/ gerenciar deps
  };

  packages = with pkgs; [ ripgrep fd git ];

  enterShell = ''
    echo "🚀 devenv python — $(python --version) / uv $(uv --version)"
  '';
}
