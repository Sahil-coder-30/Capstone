/**
 * RSA Key Generation Script
 * Run once: node certs/generate-keys.js
 * Generates private.pem and public.pem in this directory.
 */
import { generateKeyPairSync } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'private.pem');
const PUBLIC_KEY_PATH  = path.join(__dirname, 'public.pem');

if (existsSync(PRIVATE_KEY_PATH)) {
  console.log('⚠️  private.pem already exists. Delete it manually to regenerate.');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(PRIVATE_KEY_PATH, privateKey);
writeFileSync(PUBLIC_KEY_PATH,  publicKey);

console.log('✅ RSA keys generated:');
console.log('   private.pem — Keep secret, NEVER commit to git!');
console.log('   public.pem  — Safe to commit and share.');
