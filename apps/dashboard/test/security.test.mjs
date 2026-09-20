import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCredential, verifyPassword, makeRedactor } from '../security.mjs';
test('password hashes authenticate without storing plaintext',()=>{
 const secret='correct-example-password';const credential=makeCredential(secret);
 assert.equal(verifyPassword(secret,credential),true);assert.equal(verifyPassword('wrong',credential),false);
 assert.equal(verifyPassword({},credential),false);assert.equal(JSON.stringify(credential).includes(secret),false);
});
test('logs hide configured secrets and credential-bearing URLs',()=>{
 const redact=makeRedactor(['secret-example-123']);
 const result=redact('token=abc https://example.test/?secret=abc secret-example-123 icecast://user:pass@host/mount');
 assert.equal(result.includes('secret-example-123'),false);assert.equal(result.includes('abc'),false);assert.equal(result.includes('user:pass'),false);
});

test('logs hide bearer credentials and JSON credential fields',()=>{
 const redact=makeRedactor([]);
 assert.equal(redact('Authorization: Bearer abc.def.ghi').includes('abc.def.ghi'),false);
 assert.equal(redact('{"password":"unknown-secret"}').includes('unknown-secret'),false);
});
