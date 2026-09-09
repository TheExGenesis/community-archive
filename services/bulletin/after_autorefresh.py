"""Preserve the existing pipeline; start Bulletin only after its success."""
import argparse
from pathlib import Path
import subprocess


def run(pipeline_root, invoke=subprocess.run):
    result=invoke(['uv','run','--env-file',str(pipeline_root/'.env.prod'),
        str(pipeline_root/'run_pipeline.py')],cwd=pipeline_root)
    if result.returncode:
        return result.returncode
    # systemd provides the model credential and records the job's exit status.
    return invoke(['systemctl','start','ca-bulletin.service']).returncode


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pipeline-root',type=Path,required=True)
    args=parser.parse_args()
    raise SystemExit(run(args.pipeline_root.resolve()))
