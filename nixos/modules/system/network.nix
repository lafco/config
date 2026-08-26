# Rede: NetworkManager
{ ... }:
{
  networking.networkmanager.enable = true;

  # SSH para acesso remoto — descomente se quiser:
  # services.openssh.enable = true;
}
