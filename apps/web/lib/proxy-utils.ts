export interface ParsedProxy {
  protocol: string
  host: string
  port: number
  username: string | null
  password: string | null
}

/**
 * Parse proxy list from textarea input.
 * Supported formats:
 *   http://host:port
 *   socks5://user:pass@host:port
 *   http://user:pass@host:port
 *   host:port (defaults to http)
 */
export function parseProxyList(text: string): { proxies: ParsedProxy[]; errors: string[] } {
  const proxies: ParsedProxy[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    try {
      let protocol = 'http'
      let rest = line

      // Extract protocol
      const protoMatch = line.match(/^(https?|socks5):\/\/(.+)$/i)
      if (protoMatch) {
        protocol = protoMatch[1].toLowerCase()
        rest = protoMatch[2]
      }

      // Extract auth
      let username: string | null = null
      let password: string | null = null
      const atIdx = rest.lastIndexOf('@')
      if (atIdx > 0) {
        const authPart = rest.substring(0, atIdx)
        rest = rest.substring(atIdx + 1)
        const colonIdx = authPart.indexOf(':')
        if (colonIdx > 0) {
          username = authPart.substring(0, colonIdx)
          password = authPart.substring(colonIdx + 1)
        } else {
          username = authPart
        }
      }

      // Extract host:port
      const lastColon = rest.lastIndexOf(':')
      if (lastColon <= 0) {
        errors.push(`Invalid format: ${line}`)
        continue
      }
      const host = rest.substring(0, lastColon)
      const port = parseInt(rest.substring(lastColon + 1), 10)
      if (!host || isNaN(port) || port < 1 || port > 65535) {
        errors.push(`Invalid host/port: ${line}`)
        continue
      }

      // Deduplicate
      const key = `${host}:${port}`
      if (seen.has(key)) continue
      seen.add(key)

      proxies.push({ protocol, host, port, username, password })
    } catch {
      errors.push(`Parse error: ${line}`)
    }
  }

  return { proxies, errors }
}
