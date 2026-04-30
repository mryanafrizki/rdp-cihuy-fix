import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.DATA_ENCRYPTION_KEY
  if (!key) throw new Error('DATA_ENCRYPTION_KEY environment variable is required')
  return crypto.createHash('sha256').update(key).digest()
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc2:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(text: string): string {
  // Handle legacy XOR format (backward compat — remove after data migration)
  if (text.startsWith('enc:')) {
    console.warn('[crypto] Legacy XOR-encrypted value detected. Re-encrypt with AES-256-GCM.')
    return decryptLegacy(text)
  }
  if (!text.startsWith('enc2:')) return text

  const key = getKey()
  const parts = text.slice(5).split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')

  const iv = Buffer.from(parts[0], 'base64')
  const tag = Buffer.from(parts[1], 'base64')
  const encrypted = Buffer.from(parts[2], 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

function decryptLegacy(text: string): string {
  const key = process.env.DATA_ENCRYPTION_KEY || ''
  if (!key) return text
  const encoded = text.slice(4)
  const decoded = Buffer.from(encoded, 'base64').toString()
  let result = ''
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}
