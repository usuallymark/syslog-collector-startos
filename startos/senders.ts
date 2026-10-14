import { isIPv4, isIPv6 } from 'node:net'

// Sender allow-list entries: an IPv4 address, an IPv4 CIDR range, or an
// exact IPv6 address. rsyslog compares them with the address a message
// actually came from ($fromhost-ip), never with the hostname inside the
// message, which the sender controls.

export type SenderRule =
  | { kind: 'v4'; first: number; last: number }
  | { kind: 'v6'; ip: string }

function v4num(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
}

/** The rule for one entry, or null if it is not a valid address or range. */
export function parseSender(address: string): SenderRule | null {
  const a = address.trim()
  if (isIPv4(a)) {
    const n = v4num(a)
    return { kind: 'v4', first: n, last: n }
  }
  const m = /^([0-9.]+)\/(\d{1,2})$/.exec(a)
  if (m && isIPv4(m[1]) && Number(m[2]) <= 32) {
    const bits = Number(m[2])
    const size = 2 ** (32 - bits)
    const first = Math.floor(v4num(m[1]) / size) * size
    return { kind: 'v4', first, last: first + size - 1 }
  }
  if (isIPv6(a)) return { kind: 'v6', ip: a.toLowerCase() }
  return null
}

/** RainerScript condition that is true for an allowed sender. */
export function allowCondition(addresses: string[]): string | null {
  const rules = addresses
    .map(parseSender)
    .filter((r): r is SenderRule => r !== null)
  if (!rules.length) return null
  return rules
    .map((r) =>
      r.kind === 'v4'
        ? r.first === r.last
          ? `$.ipnum == ${r.first}`
          : `($.ipnum >= ${r.first} and $.ipnum <= ${r.last})`
        : `$fromhost-ip == "${r.ip}"`,
    )
    .join(' or ')
}

/**
 * The one address an entry stands for, as the sender's IP appears in the
 * logs, or null for a range. Only these can be watched for silence.
 */
export function singleAddress(address: string): string | null {
  const r = parseSender(address)
  if (!r) return null
  if (r.kind === 'v6') return r.ip
  if (r.first !== r.last) return null
  return [24, 16, 8, 0].map((s) => Math.floor(r.first / 2 ** s) % 256).join('.')
}
