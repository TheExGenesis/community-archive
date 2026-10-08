"""Run the Autorefresh pipeline, then start Bulletin once it has completed."""
import argparse
from pathlib import Path
import subprocess


def run(pipeline_root, invoke=subprocess.run):
    code=invoke(['uv','run','--env-file',str(pipeline_root/'.env.prod'),
        str(pipeline_root/'run_pipeline.py')],cwd=pipeline_root).returncode
    # Bulletin scans whatever reached serving data, so a failed pipeline still
    # starts it. --no-block releases the pipeline lock; systemd owns the result.
    invoke(['systemctl','start','--no-block','ca-bulletin.service'])
    return code


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pipeline-root',type=Path,required=True)
    args=parser.parse_args()
    raise SystemExit(run(args.pipeline_root.resolve()))
