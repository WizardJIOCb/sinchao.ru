"""Run as root on the authorized server. Does not overwrite existing credentials."""
import pathlib, secrets, subprocess
def run(*args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
env=pathlib.Path('/etc/food-sinchao.env')
if not env.exists():
    exists=run('runuser','-u','postgres','--','psql','-Atqc',"SELECT 1 FROM pg_roles WHERE rolname='food_sinchao'")
    if exists: raise SystemExit('Role already exists without service configuration; inspect before provisioning.')
    password=secrets.token_hex(32)
    run('runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',f"CREATE ROLE food_sinchao LOGIN PASSWORD '{password}'")
    run('runuser','-u','postgres','--','createdb','-O','food_sinchao','food_sinchao')
    run('runuser','-u','postgres','--','createdb','-O','food_sinchao','food_sinchao_test')
    env.write_text(f'DATABASE_URL=postgresql://food_sinchao:{password}@127.0.0.1:5432/food_sinchao\nPORT=3187\nHOST=127.0.0.1\nAPP_ORIGIN=https://food.xedoc.ru\nNODE_ENV=production\n')
    env.chmod(0o600)
if subprocess.run(['id','food-sinchao'],capture_output=True).returncode:
    run('useradd','--system','--home','/opt/food-sinchao','--shell','/usr/sbin/nologin','food-sinchao')
pathlib.Path('/opt/food-sinchao/releases').mkdir(parents=True,exist_ok=True)
pathlib.Path('/var/backups/food-sinchao').mkdir(parents=True,exist_ok=True)
print('Dedicated role, databases, service account and configuration are ready.')
