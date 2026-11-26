# nix/module.nix
#
# NixOS module for running Thanksgiving Bingo as a systemd service.
self:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.bingo;
in
{
  options.services.bingo = {
    enable = lib.mkEnableOption "Thanksgiving Bingo web app";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.default";
      description = "The Bingo package to use.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "localhost";
      example = "bingo.jordangarrison.dev";
      description = "Public hostname for the application.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 4173;
      description = "Port the HTTP server listens on.";
    };

    listenAddress = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      example = "0.0.0.0";
      description = "Address to bind the HTTP server to.";
    };

    callerPinFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Absolute path to a file containing BINGO_CALLER_PIN.
        Must NOT be a Nix store path.
        If omitted (and not in environmentFile), a random PIN is generated on startup.
      '';
    };

    inviteCodeFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Optional absolute path to a file containing BINGO_INVITE_CODE.
        Must NOT be a Nix store path.
        When set, viewing the Live Board also requires the room code or /?join=<code> link.
      '';
    };

    sessionSecretFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Optional absolute path to a file containing BINGO_SESSION_SECRET.
        Must NOT be a Nix store path.
      '';
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Optional path to an environment file (KEY=VALUE per line) for secrets/overrides.
        Must NOT be a Nix store path.
      '';
    };

    otlp = {
      endpoint = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://127.0.0.1:4318";
        description = "Optional OTLP HTTP base URL for Effect traces, metrics, and logs (e.g. Maple).";
      };

      serviceName = lib.mkOption {
        type = lib.types.str;
        default = "bingo";
        description = "OTEL_SERVICE_NAME resource attribute sent to OTLP.";
      };

      ingestKeyFile = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "/var/lib/maple-secrets/ingest-key";
        description = "Optional path to a file containing the Maple x-maple-ingest-key header value.";
      };
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the firewall for the service port.";
    };

    nginx = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether to configure an nginx reverse proxy virtualhost for Bingo.";
      };

      enableACME = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to enable ACME (Let's Encrypt) for the nginx virtualhost.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !(cfg.nginx.enable && cfg.host == "localhost");
        message = "services.bingo: nginx is enabled but host is 'localhost'. Set a real public hostname.";
      }
      {
        assertion = !(cfg.openFirewall && cfg.nginx.enable);
        message = "services.bingo: openFirewall and nginx are both enabled. Use nginx firewall settings instead.";
      }
    ];

    users.users.bingo = {
      isSystemUser = true;
      group = "bingo";
    };
    users.groups.bingo = { };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    systemd.services.bingo = {
      description = "Thanksgiving Bingo — Effect + Foldkit + SQLite";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment =
        {
          HOST = cfg.listenAddress;
          PORT = toString cfg.port;
          BINGO_DB_PATH = "/var/lib/bingo/bingo.db";
          OTEL_SERVICE_NAME = cfg.otlp.serviceName;
        }
        // lib.optionalAttrs (cfg.otlp.endpoint != null) {
          OTEL_EXPORTER_OTLP_ENDPOINT = cfg.otlp.endpoint;
        };

      script = ''
        ${lib.optionalString (cfg.callerPinFile != null) ''
          export BINGO_CALLER_PIN="$(< "$CREDENTIALS_DIRECTORY/BINGO_CALLER_PIN")"
        ''}
        ${lib.optionalString (cfg.inviteCodeFile != null) ''
          export BINGO_INVITE_CODE="$(< "$CREDENTIALS_DIRECTORY/BINGO_INVITE_CODE")"
        ''}
        ${lib.optionalString (cfg.sessionSecretFile != null) ''
          export BINGO_SESSION_SECRET="$(< "$CREDENTIALS_DIRECTORY/BINGO_SESSION_SECRET")"
        ''}
        ${lib.optionalString (cfg.otlp.ingestKeyFile != null) ''
          export MAPLE_INGEST_KEY="$(< "$CREDENTIALS_DIRECTORY/MAPLE_INGEST_KEY")"
        ''}

        exec ${lib.getExe cfg.package}
      '';

      serviceConfig = {
        Type = "exec";
        User = "bingo";
        Group = "bingo";
        StateDirectory = "bingo";
        RuntimeDirectory = "bingo";
        Restart = "on-failure";
        RestartSec = 5;
        # Effect's NodeRuntime exits with 130 when SIGTERM interrupts it.
        # That is a clean stop, not a failure.
        SuccessExitStatus = "130";
        TimeoutStopSec = "15s";

        LoadCredential =
          lib.optionals (cfg.callerPinFile != null) [ "BINGO_CALLER_PIN:${cfg.callerPinFile}" ]
          ++ lib.optionals (cfg.inviteCodeFile != null) [ "BINGO_INVITE_CODE:${cfg.inviteCodeFile}" ]
          ++ lib.optionals (cfg.sessionSecretFile != null) [ "BINGO_SESSION_SECRET:${cfg.sessionSecretFile}" ]
          ++ lib.optionals (cfg.otlp.ingestKeyFile != null) [ "MAPLE_INGEST_KEY:${cfg.otlp.ingestKeyFile}" ];

        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;

        # Security hardening
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        RestrictAddressFamilies = [
          "AF_UNIX"
          "AF_INET"
          "AF_INET6"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        ProtectControlGroups = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        LockPersonality = true;
        CapabilityBoundingSet = "";
        ProtectKernelLogs = true;
        UMask = "0077";
      };
    };

    services.nginx = lib.mkIf cfg.nginx.enable (
      let
        urlAddr =
          if lib.hasInfix ":" cfg.listenAddress then "[${cfg.listenAddress}]" else cfg.listenAddress;
      in
      {
        enable = true;
        recommendedProxySettings = true;
        recommendedTlsSettings = true;
        recommendedOptimisation = true;
        recommendedGzipSettings = true;

        virtualHosts.${cfg.host} = {
          forceSSL = true;
          enableACME = cfg.nginx.enableACME;

          locations."/" = {
            proxyPass = "http://${urlAddr}:${toString cfg.port}";
            extraConfig = ''
              proxy_buffering off;
              proxy_cache off;
              proxy_read_timeout 3600s;
            '';
          };
        };
      }
    );
  };
}
