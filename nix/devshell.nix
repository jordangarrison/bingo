{ pkgs }:

pkgs.mkShell {
  packages = [
    pkgs.nodejs_24
    pkgs.pnpm
    pkgs.ast-grep
    pkgs.sqlite
  ];
}
