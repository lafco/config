# AMD: Ryzen 5 5500 + Radeon RX 7600 (Navi 33 / RDNA3)
{ pkgs, ... }:
{
  # Mesa + RADV (Vulkan) — suporte out-of-the-box para GPUs AMD
  hardware.graphics = {
    enable = true;
    enable32Bit = true; # jogos 32-bit no Steam
  };

  # Microcode da AMD
  hardware.cpu.amd.updateMicrocode = true;

  environment.systemPackages = with pkgs; [
    radeontop    # monitor de uso da GPU no terminal
    vulkan-tools # vulkaninfo etc.
  ];
}
