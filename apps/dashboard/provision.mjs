import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { makeCredential } from './security.mjs';
const directory = new URL('../../.data/dashboard/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
try { await access(new URL('auth.json', directory)); console.log('Login existente preservado.'); }
catch {
  const password = randomBytes(24).toString('base64url');
  await writeFile(new URL('auth.json', directory), JSON.stringify({ username: 'owner', ...makeCredential(password) }), { mode: 0o600, flag: 'wx' });
  await writeFile(new URL('access.txt', directory), `Utilizador: owner\nSenha: ${password}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Login criado em .data/dashboard/access.txt (permissões 600).');
}
const credentialPath = new URL('auth.json', directory);
const { readFile } = await import('node:fs/promises');
const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
if (!credential.ownerImvuId) {
  if (!process.env.ROOMWAVE_ROOM_ID) throw new Error('Carrega .env com --env-file=.env para associar o dono.');
  const response = await fetch(`${process.env.ROOMWAVE_API_URL || 'http://127.0.0.1:3001'}/api/rooms/${encodeURIComponent(process.env.ROOMWAVE_ROOM_ID)}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('API indisponível para associar o dono.');
  const { room } = await response.json();
  const owners = room.members.filter(m => m.role === 'OWNER' && m.user.imvuUserId);
  const owner = process.env.ROOMWAVE_DASHBOARD_OWNER_IMVU_ID ? owners.find(m => m.user.imvuUserId === process.env.ROOMWAVE_DASHBOARD_OWNER_IMVU_ID) : owners.length === 1 ? owners[0] : null;
  if (!owner) throw new Error('Configura ROOMWAVE_DASHBOARD_OWNER_IMVU_ID.');
  credential.ownerImvuId = owner.user.imvuUserId;
  await writeFile(credentialPath, JSON.stringify(credential), { mode: 0o600 });
  console.log('Login associado ao dono atual da sala.');
}
