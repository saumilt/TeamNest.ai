"""FastAPI route modules — one per domain.

Each module exposes a `router` variable that the main `server.py` mounts under
the `/api` prefix. Cross-router helpers live in `deps.py` and `services/`.
"""
