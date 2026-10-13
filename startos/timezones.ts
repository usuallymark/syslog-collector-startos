// IANA time zones grouped by region, for the two-step picker in Configure
// Receiver (region, then city). Built from the time zones Node knows.

export const UTC = 'UTC'

const REGION_NAMES: Record<string, string> = {
  Africa: 'Africa',
  America: 'Americas',
  Antarctica: 'Antarctica',
  Arctic: 'Arctic',
  Asia: 'Asia',
  Atlantic: 'Atlantic',
  Australia: 'Australia',
  Europe: 'Europe',
  Indian: 'Indian Ocean',
  Pacific: 'Pacific',
}

function allZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

/** region id -> { zone id -> city label }, regions and cities sorted. */
export const ZONES_BY_REGION: Record<string, Record<string, string>> = {}
for (const zone of allZones()) {
  const slash = zone.indexOf('/')
  if (slash < 0) continue
  const region = zone.slice(0, slash)
  if (!(region in REGION_NAMES)) continue
  const city = zone.slice(slash + 1).replace(/_/g, ' ')
  ;(ZONES_BY_REGION[region] ??= {})[zone] = city
}
for (const region of Object.keys(ZONES_BY_REGION)) {
  ZONES_BY_REGION[region] = Object.fromEntries(
    Object.entries(ZONES_BY_REGION[region]).sort((a, b) =>
      a[1].localeCompare(b[1]),
    ),
  )
}

export const REGIONS = Object.keys(REGION_NAMES).filter(
  (r) => r in ZONES_BY_REGION,
)

export function regionName(region: string): string {
  return REGION_NAMES[region] ?? region
}

/** The region a stored zone belongs to, or null for UTC and unknown zones. */
export function regionOf(zone: string): string | null {
  const region = zone.split('/')[0]
  return REGIONS.includes(region) ? region : null
}

/** The zone as Node spells it, or null if Node does not know it. */
export function canonicalZone(name: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: name.trim(),
    }).resolvedOptions().timeZone
  } catch {
    return null
  }
}
