#!/usr/bin/env python3
"""Obtain a NodeLink-compatible token without printing credentials or changing services."""
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.data/nodelink/youtube-oauth.env'


def post(path, payload):
    request = urllib.request.Request(
        'https://www.youtube.com/o/oauth2/' + path,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        result = json.load(response)
    if not isinstance(result, dict):
        raise RuntimeError('Resposta OAuth inesperada.')
    return result


def save_token(token):
    DEST.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.youtube-oauth-', dir=DEST.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write('NODELINK_SOURCES_YOUTUBE_GETOAUTHTOKEN=false\n')
            stream.write('NODELINK_SOURCES_YOUTUBE_CLIENTS_SETTINGS_TV_REFRESHTOKEN=')
            stream.write(json.dumps([token]) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, DEST)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    if DEST.exists():
        raise RuntimeError('Já existe um token guardado. Não foi substituído.')
    # Reuse the installed implementation's public OAuth client and scopes.
    source = (ROOT / 'nodelink-test/src/sources/youtube/OAuth.ts').read_text()
    constants = {}
    for key in ('CLIENT_ID', 'CLIENT_SECRET', 'SCOPES'):
        match = re.search(r'const ' + key + r"\s*=\s*'([^']+)'", source)
        if not match:
            raise RuntimeError('Configuração OAuth local incompatível: ' + key)
        constants[key] = match.group(1)
    device = post('device/code', {
        'client_id': constants['CLIENT_ID'], 'scope': constants['SCOPES'],
    })
    if not all(isinstance(device.get(k), str) for k in
               ('device_code', 'user_code', 'verification_url')):
        raise RuntimeError('Google não disponibilizou o código de autorização.')
    print('Abre no teu browser:', device['verification_url'], flush=True)
    print('Introduz este código:', device['user_code'], flush=True)
    print('Confirma a conta e as permissões apresentadas pelo Google.', flush=True)
    print('À espera da autorização (Ctrl+C para cancelar)...', flush=True)
    interval = max(5, int(device.get('interval', 5)))
    deadline = time.monotonic() + min(int(device.get('expires_in', 600)), 1800)
    while time.monotonic() < deadline:
        time.sleep(interval)
        result = post('token', {
            'client_id': constants['CLIENT_ID'],
            'client_secret': constants['CLIENT_SECRET'],
            'code': device['device_code'],
            'grant_type': 'http://oauth.net/grant_type/device/1.0',
        })
        error = result.get('error')
        if error == 'authorization_pending':
            continue
        if error == 'slow_down':
            interval += 5
            continue
        token = result.get('refresh_token')
        if error or not isinstance(token, str) or not token:
            raise RuntimeError('Autorização recusada ou resposta sem refresh token.')
        save_token(token)
        print('Token guardado com permissões 600 em:', DEST)
        print('Ainda não aplicado ao contentor. Próximo passo: teste de áudio com OAuth.')
        return
    raise RuntimeError('O código expirou. Executa novamente para tentar outra vez.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nAutorização cancelada.')
        raise SystemExit(130)
    except (RuntimeError, OSError, ValueError) as exc:
        # Never print upstream response bodies: they may contain credentials.
        print(str(exc) if isinstance(exc, RuntimeError) else
              'Falha de ligação, resposta inválida ou erro ao guardar o token.')
        raise SystemExit(1)
