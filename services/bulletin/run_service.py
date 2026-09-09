"""Read runtime credentials without putting their values in files or argv."""
import os
import sys
from pathlib import Path
import subprocess

if __name__=='__main__':
    env=os.environ.copy()
    credential=Path(env['CREDENTIALS_DIRECTORY'])/'openrouter_api_key'
    env['OPENROUTER_API_KEY']=credential.read_text().strip()
    raise SystemExit(subprocess.run(['uv','run','--env-file','/root/CA_autorefresh/.env.prod',
        str(Path(__file__).with_name('worker.py')),*sys.argv[1:]],env=env).returncode)
