# Host: hmpc — AMD Ryzen 5 5500 + Radeon RX 7600 (Navi 33 / RDNA3)
{ inputs, ... }:

{
  imports = [
    ./hardware-configuration.nix
    ../../modules/system/base.nix
    ../../modules/system/boot.nix
    ../../modules/system/locale.nix
    ../../modules/system/network.nix
    ../../modules/system/audio.nix
    ../../modules/system/amd.nix
    ../../modules/system/desktop.nix
    ../../modules/system/gaming.nix
  ];

  networking.hostName = "hmpc";

  # ⚠️ Nunca mude depois de instalar — define o formato do state em ~/.local/state
  system.stateVersion = "25.11";

  # Pacotes que ainda não existem no canal estável (25.11):
  # pi (pi.dev) e herdr só estão no nixpkgs-unstable.
  # Uso: pkgs.unstable.pi-coding-agent (ver modules/home/ai.nix)
  nixpkgs.overlays = [
    (final: prev: {
      unstable = import inputs.nixpkgs-unstable {
        system = prev.stdenv.hostPlatform.system;
        config.allowUnfree = true;
      };
    })
  ];

  # Home Manager roda como módulo do NixOS (mesmo flake, mesmo build)
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    extraSpecialArgs = { inherit inputs; };
    users.lafco.imports = [ ../../modules/home ];
  };
}
