"""Retain the Autorefresh cron entrypoint; Bulletin has its own timer."""
import argparse
from pathlib import Path
import subprocess


def run(pipeline_root, invoke=subprocess.run):
    return invoke(['uv','run','--env-file',str(pipeline_root/'.env.prod'),
        str(pipeline_root/'run_pipeline.py')],cwd=pipeline_root).returncode


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pipeline-root',type=Path,required=True)
    args=parser.parse_args()
    raise SystemExit(run(args.pipeline_root.resolve()))
