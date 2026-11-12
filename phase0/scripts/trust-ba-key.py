#!/usr/bin/env python3
"""LOCAL TEST STACK ONLY. Recreate the local Realtime and PostgREST containers with an
extra trusted JWKS entry (Better Auth's public key), emulating what a hosted Supabase
project does for Custom OIDC. Hosted projects fetch the key from the discovery URL instead."""
import json, subprocess, sys
ba = json.load(open('/home/user/qayd/phase0/identity/last-run.json'))['jwks']['keys'][0]
ba = {**ba, 'use': 'sig', 'key_ops': ['verify'], 'ext': True}
# also trust the local test signing key (public part) so the Edge probe can call PostgREST as service_role
mine = [k for k in json.load(open('/home/user/qayd/phase0/supabase/signing_keys.json')) if 'd' in k][0]
mine_pub = {k: v for k, v in mine.items() if k != 'd'}; mine_pub['key_ops'] = ['verify']; mine_pub['ext'] = True
def sh(*a): return subprocess.run(a, capture_output=True, text=True, check=True).stdout
def recreate(name, env_key, alias_args, extra):
    info = json.loads(sh('docker', 'inspect', name))[0]
    env = dict(e.split('=', 1) for e in info['Config']['Env'])
    cur = env[env_key]
    jwks = json.loads(cur)
    for add in (ba, mine_pub):
        if not any(k.get("kid") == add["kid"] for k in jwks["keys"]): jwks["keys"].append(add)
    env[env_key] = json.dumps(jwks, separators=(',', ':'))
    net = list(info['NetworkSettings']['Networks'].keys())[0]
    aliases = info['NetworkSettings']['Networks'][net]['Aliases'] or []
    img = info['Config']['Image']
    sh('docker', 'rm', '-f', name)
    cmd = ['docker', 'run', '-d', '--name', name, '--network', net]
    for a in aliases:
        if a != info['Id'][:12]: cmd += ['--network-alias', a]
    for k, v in env.items():
        if k in ('PATH', 'HOME', 'HOSTNAME') or k.startswith('LC_') or k in ('LANG', 'LANGUAGE'): continue
        cmd += ['-e', f'{k}={v}']
    ep = info['Config'].get('Entrypoint'); 
    if ep: cmd += ['--entrypoint', ep[0]]
    cmd += extra + [img] + ((ep[1:] if ep else []) + (info['Config'].get('Cmd') or []))
    print(name, '->', sh(*cmd).strip()[:12])
recreate('supabase_realtime_phase0', 'API_JWT_JWKS', [], ['--ulimit', 'nofile=10000:10000'])
recreate('supabase_rest_phase0', 'PGRST_JWT_SECRET', [], [])
