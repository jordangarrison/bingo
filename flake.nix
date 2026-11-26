{
  description = "Thanksgiving Bingo — Effect + Foldkit + SQLite app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          bingo = pkgs.callPackage ./nix/package.nix { };
        in
        {
          inherit bingo;
          default = bingo;
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = import ./nix/devshell.nix { inherit pkgs; };
        }
      );

      nixosModules.default = import ./nix/module.nix self;
    };
}
