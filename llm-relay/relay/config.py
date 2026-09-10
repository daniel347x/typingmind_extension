"""Relay configuration: route table and runtime settings.

Routes are *explicit* and supplied by the caller in the URL path. The relay
never infers a provider from a model name - the same model may be served by
several hosts, and the harness already knows which one it picked.

A route is nothing but a name -> base_url mapping. No key material lives here
and no per-provider dialect logic exists: the relay forwards path, headers and
bytes verbatim.

Config file format is JSON (stdlib only, no PyYAML dependency)::

    {
      "bind": "127.0.0.1",
      "port": 8787,
      "token_env": "LLM_RELAY_TOKEN",
      "store_dir": "/var/lib/llm-relay/chunks",
      "capacity_bytes": 107374182400,
      "upstream_read_timeout": null,
      "max_envelope_bytes": 268435456,
      "max_manifest_entries": 400000,
      "max_new_chunk_bytes": 134217728,
      "routes": {
        "anthropic-claude": {"base_url": "https://api.anthropic.com"},
        "deepinfra-qwen":   {"base_url": "https://api.deepinfra.com/v1/openai"}
      }
    }

Security defaults: bind is 127.0.0.1 (tunnel-only) and a relay token is
REQUIRED at startup - the server refuses to start without one.
"""

from __future__ import annotations

import json
import os
import re
from typing import Dict, Optional

DEFAULT_BIND = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_STORE_DIR = "/var/lib/llm-relay/chunks"
DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024

#: 256 MB envelope ceiling (a very large multimodal payload plus base64 chunks).
DEFAULT_MAX_ENVELOPE_BYTES = 256 * 1024 * 1024
DEFAULT_MAX_MANIFEST_ENTRIES = 400_000
DEFAULT_MAX_NEW_CHUNK_BYTES = 128 * 1024 * 1024
DEFAULT_MAX_BODY_BYTES = 512 * 1024 * 1024

#: Route names appear in a URL path segment: keep them boring and unambiguous.
ROUTE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

TOKEN_ENV_DEFAULT = "LLM_RELAY_TOKEN"


class ConfigError(Exception):
    """Raised for invalid or unsafe configuration."""


class Route:
    __slots__ = ("name", "base_url")

    def __init__(self, name: str, base_url: str) -> None:
        self.name = name
        self.base_url = base_url.rstrip("/")

    def url_for(self, path: str) -> str:
        """Join base_url with the caller-supplied request path."""
        if not path:
            return self.base_url
        return self.base_url + "/" + path.lstrip("/")

    def to_dict(self) -> dict:
        return {"name": self.name, "base_url": self.base_url}


class Config:
    def __init__(
        self,
        *,
        bind: str = DEFAULT_BIND,
        port: int = DEFAULT_PORT,
        token: str = "",
        store_dir: str = DEFAULT_STORE_DIR,
        capacity_bytes: int = DEFAULT_CAPACITY_BYTES,
        upstream_read_timeout: Optional[float] = None,
        max_envelope_bytes: int = DEFAULT_MAX_ENVELOPE_BYTES,
        max_manifest_entries: int = DEFAULT_MAX_MANIFEST_ENTRIES,
        max_new_chunk_bytes: int = DEFAULT_MAX_NEW_CHUNK_BYTES,
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
        routes: Optional[Dict[str, Route]] = None,
    ) -> None:
        self.bind = bind
        self.port = int(port)
        self.token = token
        self.store_dir = store_dir
        self.capacity_bytes = int(capacity_bytes)
        #: Per spec v1 section 10: NO relay-side timeout on the upstream
        #: stream. Thinking models can stream for many minutes. None means
        #: block indefinitely; setting a value is a deliberate deviation.
        self.upstream_read_timeout = upstream_read_timeout
        self.max_envelope_bytes = int(max_envelope_bytes)
        self.max_manifest_entries = int(max_manifest_entries)
        self.max_new_chunk_bytes = int(max_new_chunk_bytes)
        self.max_body_bytes = int(max_body_bytes)
        self.routes: Dict[str, Route] = routes or {}

    # ------------------------------------------------------------- accessors

    def route(self, name: str) -> Optional[Route]:
        return self.routes.get(name)

    def route_names(self):
        return sorted(self.routes)

    def validate(self) -> "Config":
        if not self.token:
            raise ConfigError(
                "relay token is required: set %s (or 'token' in config). "
                "Refusing to start an unauthenticated relay." % TOKEN_ENV_DEFAULT
            )
        if self.bind not in ("127.0.0.1", "::1", "localhost"):
            # Not forbidden, but it must be a conscious choice: the v1 threat
            # model is "loopback + SSH tunnel only".
            self._bind_warning = (
                "bind=%s is not loopback; ensure the host is firewalled." % self.bind
            )
        else:
            self._bind_warning = None
        if not self.routes:
            raise ConfigError("no routes configured")
        for name, route in self.routes.items():
            if not ROUTE_NAME_RE.match(name):
                raise ConfigError("invalid route name: %r" % (name,))
            if not route.base_url.startswith(("https://", "http://")):
                raise ConfigError(
                    "route %s base_url must be http(s): %r" % (name, route.base_url)
                )
            if route.base_url.startswith("http://") and self.bind not in (
                "127.0.0.1",
                "::1",
                "localhost",
            ):
                raise ConfigError(
                    "route %s uses plaintext http:// - only allowed on loopback" % name
                )
        if self.capacity_bytes <= 0:
            raise ConfigError("capacity_bytes must be > 0")
        return self

    @property
    def bind_warning(self) -> Optional[str]:
        return getattr(self, "_bind_warning", None)

    def to_dict(self, *, include_token: bool = False) -> dict:
        out = {
            "bind": self.bind,
            "port": self.port,
            "store_dir": self.store_dir,
            "capacity_bytes": self.capacity_bytes,
            "upstream_read_timeout": self.upstream_read_timeout,
            "max_envelope_bytes": self.max_envelope_bytes,
            "max_manifest_entries": self.max_manifest_entries,
            "max_new_chunk_bytes": self.max_new_chunk_bytes,
            "max_body_bytes": self.max_body_bytes,
            "routes": {n: r.base_url for n, r in sorted(self.routes.items())},
        }
        if include_token:
            out["token"] = self.token
        else:
            out["token_set"] = bool(self.token)
        return out


def load_config(
    path: Optional[str] = None,
    *,
    token_env: str = TOKEN_ENV_DEFAULT,
    overrides: Optional[dict] = None,
) -> Config:
    """Load config from JSON file + environment + explicit overrides.

    Precedence (highest last): file defaults < environment < overrides.
    """
    raw: dict = {}
    if path:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)

    routes: Dict[str, Route] = {}
    for name, spec in (raw.get("routes") or {}).items():
        base_url = spec.get("base_url") if isinstance(spec, dict) else spec
        if not isinstance(base_url, str) or not base_url:
            raise ConfigError("route %s has no base_url" % (name,))
        routes[name] = Route(name, base_url)

    token = os.environ.get(raw.get("token_env", token_env), "") or raw.get("token", "")

    cfg = Config(
        bind=raw.get("bind", DEFAULT_BIND),
        port=int(raw.get("port", DEFAULT_PORT)),
        token=token,
        store_dir=raw.get("store_dir", DEFAULT_STORE_DIR),
        capacity_bytes=int(raw.get("capacity_bytes", DEFAULT_CAPACITY_BYTES)),
        upstream_read_timeout=raw.get("upstream_read_timeout", None),
        max_envelope_bytes=int(
            raw.get("max_envelope_bytes", DEFAULT_MAX_ENVELOPE_BYTES)
        ),
        max_manifest_entries=int(
            raw.get("max_manifest_entries", DEFAULT_MAX_MANIFEST_ENTRIES)
        ),
        max_new_chunk_bytes=int(
            raw.get("max_new_chunk_bytes", DEFAULT_MAX_NEW_CHUNK_BYTES)
        ),
        max_body_bytes=int(raw.get("max_body_bytes", DEFAULT_MAX_BODY_BYTES)),
        routes=routes,
    )

    for key, value in (overrides or {}).items():
        if value is None:
            continue
        if not hasattr(cfg, key):
            raise ConfigError("unknown config override: %s" % key)
        if key == "routes":
            raise ConfigError("routes cannot be overridden inline; edit the config file")
        setattr(cfg, key, value)

    return cfg.validate()
