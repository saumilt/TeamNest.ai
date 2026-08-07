#!/usr/bin/env python3
"""Mint an auth token for a given user id. Used by mobile UI tests."""
import sys
sys.path.insert(0, "/app/backend")
from auth_utils import create_token
print(create_token(sys.argv[1]))
