"""Execute the complete scientific batch, outside HTTP request handlers.

From repo root: python -m backend.process --offline
"""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Recompute using only previously downloaded inputs.')
    parser.add_argument('--export-only', action='store_true', help='Only export and validate the versioned catalog; no GIS dependencies or downloads.')
    args = parser.parse_args()
    scripts = ROOT/'backend/processing'
    commands = []
    if not args.export_only:
        commands.extend([
            [sys.executable,str(scripts/'pipeline.py'),*(['--offline'] if args.offline else [])],
            [sys.executable,str(scripts/'validate_catalog.py')],
            [sys.executable,str(scripts/'render_quality.py')],
            [sys.executable,str(scripts/'write_report.py')],
        ])
    commands.extend([
        [sys.executable,str(scripts/'export_frontend.py')],
        [sys.executable,str(scripts/'export_frontend.py'),'--check'],
        ['node',str(ROOT/'frontend/scripts/validate-data.mjs'),'--release'],
    ])
    for index, command in enumerate(commands,1):
        print(f'[{index}/{len(commands)}] {Path(command[1]).name}',flush=True)
        subprocess.run(command,cwd=ROOT,check=True)
    print('Procesamiento completo. Reiniciar la API para cargar el nuevo snapshot.')


if __name__=='__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
