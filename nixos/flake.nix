# flake.nix — NixOS declarativo para hmpc
#
# Entradas:
#   nixpkgs            → canal estável (NixOS 25.11)
#   nixpkgs-unstable   → só para pacotes que ainda não chegaram no estável
#                        (pi-coding-agent, herdr) — ver hosts/hmpc/default.nix
#   home-manager       → configuração do usuário como módulo do NixOS
#   devenv             → CLI do devenv (instalado via home-manager)
{
  description = "NixOS — hmpc (AMD Ryzen 5 5500 + Radeon RX 7600)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    devenv.url = "github:cachix/devenv";
  };

  # Cache público do devenv — evita compilar a CLI localmente
  nixConfig = {
    extra-substituters = [ "https://devenv.cachix.org" ];
    extra-trusted-public-keys = [
      "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw="
    ];
  };

  outputs = { self, nixpkgs, home-manager, ... }@inputs: {
    nixosConfigurations.hmpc = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      specialArgs = { inherit inputs; };
      modules = [
        ./hosts/hmpc
        home-manager.nixosModules.home-manager
      ];
    };
  };
}
