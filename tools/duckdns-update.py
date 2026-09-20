#!/usr/bin/env python3
"""Update RoomWave DNS without logging the private DuckDNS token."""
import getpass
import ipaddress
import os
from pathlib import Path
import sys
import tempfile
import urllib.parse
import urllib.request

DOMAIN = 'roomwavebot'
TOKEN_FILE = Path(__file__).resolve().parents[1] / '.data/duckdns/token'


def request(url, **kwargs):
    # EC2 metadata and DuckDNS must not pass through a configured proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(urllib.request.Request(url, **kwargs), timeout=15) as response:
        return response.read().decode().strip()


def public_ip():
    base = 'http://169.254.169.254/latest/'
    token = request(base + 'api/token', method='PUT',
                    headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'})
    value = request(base + 'meta-data/public-ipv4',
                    headers={'X-aws-ec2-metadata-token': token})
    return str(ipaddress.IPv4Address(value))


def update(token):
    address = public_ip()
    query = urllib.parse.urlencode({'domains': DOMAIN, 'token': token, 'ip': address})
    result = request('https://www.duckdns.org/update?' + query)
    if result != 'OK':
        raise ValueError('DuckDNS rejected update')
    print(f'DuckDNS atualizado: {DOMAIN}.duckdns.org -> {address}')


def main():
    if sys.argv[1:] == ['--setup']:
        token = getpass.getpass('Token DuckDNS (oculto): ').strip()
        if not token:
            raise ValueError('Empty token')
        # Verify before replacing the working credential.
        update(token)
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temp = tempfile.mkstemp(dir=TOKEN_FILE.parent)
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(token + '\n')
            os.replace(temp, TOKEN_FILE)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
        print('Token guardado com permissões 600. Atualização automática preparada.')
    elif not sys.argv[1:]:
        update(TOKEN_FILE.read_text().strip())
    else:
        raise ValueError('Invalid arguments')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        # HTTP exceptions can contain the URL and token: never print them.
        print('Falha na atualização DuckDNS. Verifica o token, a rede e os metadados EC2.', file=sys.stderr)
        sys.exit(1)
