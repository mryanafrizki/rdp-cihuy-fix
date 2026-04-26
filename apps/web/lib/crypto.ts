const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'rdp-panel-default-key-change-me!!'

export function encrypt(text: string): string {
  // Simple XOR + base64 for now (not military-grade but hides plain text)
  const key = ENCRYPTION_KEY
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return 'enc:' + Buffer.from(result).toString('base64')
}

export function decrypt(text: string): string {
  if (!text.startsWith('enc:')) return text // Not encrypted, return as-is
  const encoded = text.slice(4)
  const decoded = Buffer.from(encoded, 'base64').toString()
  const key = ENCRYPTION_KEY
  let result = ''
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}
