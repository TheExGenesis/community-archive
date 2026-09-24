"""Read runtime credentials without putting their values in files or argv."""
import os
import sys
from pathlib import Path
import subprocess

if __name__=='__main__':
    env=os.environ.copy()
    processor=env.get('BULLETIN_PROCESSOR','legacy')
    if processor not in ('legacy','jev'):
        raise SystemExit('Invalid BULLETIN_PROCESSOR')
    if processor=='jev' and '--queued-only' in sys.argv[1:]:
        raise SystemExit('Jev cutover requires the legacy refresh timer to be disabled')
    credential=Path(env['CREDENTIALS_DIRECTORY'])/'openrouter_api_key'
    env['OPENROUTER_API_KEY']=credential.read_text().strip()
    gateway_credential=Path(env['CREDENTIALS_DIRECTORY'])/'clickhouse_api_token'
    env['CLICKHOUSE_ANALYTICS_API_TOKEN']=gateway_credential.read_text().strip()
    raise SystemExit(subprocess.run(['uv','run','--env-file','/root/CA_autorefresh/.env.prod',
        str(Path(__file__).with_name('jev_worker.py' if processor=='jev' else 'worker.py')),
        *sys.argv[1:]],env=env).returncode)
