import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function makeCredential(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function verifyPassword(password, credential) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const hash = scryptSync(password, credential.salt, 64);
  const expected = Buffer.from(credential.hash, 'hex');
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}
export function makeRedactor(secrets) {
  const values = [...new Set(secrets.filter(s => typeof s === 'string' && s.length >= 6))].sort((a,b) => b.length-a.length);
  return text => {
    let result = String(text);
    for (const value of values) result = result.split(value).join('[oculto]');
    result = result.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [oculto]');
    result = result.replace(/("(?:password|secret|token|refresh_token|access_token|authorization|cookie|api_key)"\s*:\s*)"[^"]*"/gi, '$1"[oculto]"');
    return result.replace(/(?:https?|icecast):\/\/[^\s"<>]+/gi, '[URL oculta]')
      .replace(/((?:authorization|password|secret|token|refresh[_-]?token|access[_-]?token|cookie|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[oculto]')
      .replace(/\x1b\[[0-9;]*m/g, '').slice(0, 1500);
  };
}
