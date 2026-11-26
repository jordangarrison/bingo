{
  lib,
  stdenv,
  nodejs_24,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeWrapper,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "bingo";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: type:
      let
        baseName = baseNameOf path;
      in
      !(
        baseName == "node_modules"
        || baseName == "dist"
        || baseName == ".direnv"
        || baseName == ".git"
        || baseName == "result"
        || lib.hasPrefix "bingo.db" baseName
      )
      && lib.cleanSourceFilter path type;
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 4;
    hash = "sha256-MiUTt9EhCEEN/KgRRm9s7MAEYThTpmvQZ0nnzUMU2hg=";
  };

  nativeBuildInputs = [
    nodejs_24
    pnpm
    pnpmConfigHook
    makeWrapper
  ];

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/bingo $out/bin
    cp -r dist $out/share/bingo/dist
    cp -r server $out/share/bingo/server

    makeWrapper ${nodejs_24}/bin/node $out/bin/bingo-server \
      --add-flags "$out/share/bingo/server/standalone.mjs" \
      --set-default BINGO_DIST_DIR "$out/share/bingo/dist"

    runHook postInstall
  '';

  meta = {
    description = "Thanksgiving Bingo — Effect + Foldkit + SQLite web app";
    license = lib.licenses.mit;
    mainProgram = "bingo-server";
  };
})
