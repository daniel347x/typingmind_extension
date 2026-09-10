"""Entrypoint: python3 -m relay --config config/relay.json

Fails fast on unsafe configuration (no token, no routes) rather than starting
an unauthenticated relay.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from . import __version__
from .config import ConfigError, TOKEN_ENV_DEFAULT, load_config
from .server import run_forever


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="llm-relay",
        description="Transport-only content-addressed dedup proxy for LLM API calls.",
    )
    parser.add_argument("--config", default=None, help="path to relay JSON config")
    parser.add_argument("--bind", default=None, help="override bind address")
    parser.add_argument("--port", type=int, default=None, help="override port")
    parser.add_argument("--store", default=None, help="override chunk store directory")
    parser.add_argument(
        "--capacity-gb", type=float, default=None, help="override LRU capacity in GB"
    )
    parser.add_argument(
        "--token",
        default=None,
        help="relay token (prefer the %s environment variable)" % TOKEN_ENV_DEFAULT,
    )
    parser.add_argument(
        "--upstream-read-timeout",
        type=float,
        default=None,
        help="DEVIATION FROM SPEC: cap the upstream stream (default: no timeout)",
    )
    parser.add_argument("--log-level", default="INFO")
    parser.add_argument("--version", action="version", version="llm-relay " + __version__)
    args = parser.parse_args(argv)

    overrides = {
        "bind": args.bind,
        "port": args.port,
        "store_dir": args.store,
        "token": args.token,
        "upstream_read_timeout": args.upstream_read_timeout,
    }
    if args.capacity_gb is not None:
        overrides["capacity_bytes"] = int(args.capacity_gb * 1024 * 1024 * 1024)

    try:
        config = load_config(args.config, overrides=overrides)
    except ConfigError as exc:
        print("config error: %s" % exc, file=sys.stderr)
        return 2
    except OSError as exc:
        print("cannot read config: %s" % exc, file=sys.stderr)
        return 2

    level = getattr(logging, str(args.log_level).upper(), logging.INFO)
    if config.upstream_read_timeout is not None:
        logging.warning(
            "upstream_read_timeout=%s is set; spec v1 requires NO upstream timeout",
            config.upstream_read_timeout,
        )
    run_forever(config, log_level=level)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
