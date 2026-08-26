# Git tooling
{ pkgs, ... }:
{
  programs.git = {
    enable = true;
    # TODO: ajuste identidade antes do primeiro commit
    userName = "lafco";
    userEmail = "lafco@users.noreply.github.com";
    extraConfig = {
      init.defaultBranch = "main";
      pull.rebase = true;
    };
  };

  # gh + credential helper do git
  programs.gh.enable = true;

  home.packages = with pkgs; [
    lazygit
    jujutsu # jj
    gh-dash # dashboard TUI
    diffnav # pager de diff usado pelo gh-dash
  ];
}
