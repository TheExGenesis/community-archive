"""One-shot Jev snapshot import with runtime-only gateway credentials."""
import os
from pathlib import Path
import subprocess
import sys


if __name__=='__main__':
    env=os.environ.copy()
    credential=Path(env['CREDENTIALS_DIRECTORY'])/'clickhouse_api_token'
    env['CLICKHOUSE_ANALYTICS_API_TOKEN']=credential.read_text().strip()
    raise SystemExit(subprocess.run(['uv','run','--env-file','/root/CA_autorefresh/.env.prod',
        str(Path(__file__).with_name('import_jev_snapshot.py')),*sys.argv[1:]],env=env).returncode)
