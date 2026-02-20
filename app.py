"""
SuperCompare — Entry Point
===========================
    uvicorn app:app --reload --port 8000
    http://localhost:8000/docs
"""
import sys
import os

# Garantizar que la raíz del proyecto esté en sys.path
# (necesario para Windows + uvicorn --reload)
_root = os.path.dirname(os.path.abspath(__file__))
if _root not in sys.path:
    sys.path.insert(0, _root)

from api.main_v2 import app  # noqa: E402
