"""Compatibility entry point. Canonical implementation: backend/processing/render_quality.py."""
import sys
from pathlib import Path
import runpy

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'backend' / 'processing'))
if __name__ == '__main__':
    runpy.run_module('backend.processing.render_quality', run_name='__main__')
else:
    from backend.processing.render_quality import *  # noqa: F403
