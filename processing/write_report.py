"""Compatibility entry point. Canonical implementation: backend/processing/write_report.py."""
import sys
from pathlib import Path
import runpy

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / 'backend' / 'processing'))
if __name__ == '__main__':
    runpy.run_module('backend.processing.write_report', run_name='__main__')
else:
    from backend.processing.write_report import *  # noqa: F403
