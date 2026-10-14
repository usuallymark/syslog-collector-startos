import { VersionInfo } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { singleAddress } from '../senders'

type Raw = {
  allowedSenders?: Record<string, unknown>[]
  alerts?: { rules?: { stopped?: Record<string, unknown> } }
  [k: string]: unknown
}

async function readRaw(): Promise<Raw | null> {
  try {
    return JSON.parse(
      String(await sdk.volumes.main.readFile('settings.json', 'utf8')),
    ) as Raw
  } catch {
    return null
  }
}

async function writeRaw(raw: Raw) {
  await sdk.volumes.main.writeFile(
    'settings.json',
    JSON.stringify(raw, null, 2),
  )
}

// Up to 8.2504.0:6, "Logging stopped" had one limit for every single address
// on the allow-list. Each sender now has its own, blank for devices that
// only log when something happens. Existing single addresses keep the old
// limit, so nothing changes until the user clears it.
async function silenceLimitPerSender() {
  const raw = await readRaw()
  if (!raw) return
  const stopped = raw.alerts?.rules?.stopped
  const old = Number(stopped?.minutes)
  const minutes = Number.isInteger(old) && old >= 1 ? old : 15
  for (const s of raw.allowedSenders ?? []) {
    s.silentMinutes = singleAddress(String(s.address ?? '')) ? minutes : null
  }
  if (stopped) delete stopped.minutes
  await writeRaw(raw)
}

async function silenceLimitShared() {
  const raw = await readRaw()
  if (!raw) return
  const limits = (raw.allowedSenders ?? [])
    .map((s) => Number(s.silentMinutes))
    .filter((n) => Number.isInteger(n) && n >= 1)
  for (const s of raw.allowedSenders ?? []) delete s.silentMinutes
  const stopped = raw.alerts?.rules?.stopped
  if (stopped) stopped.minutes = limits.length ? Math.min(...limits) : 15
  await writeRaw(raw)
}

export const v8_2504_0_7 = VersionInfo.of({
  version: '8.2504.0:7',
  releaseNotes: {
    en_US: `"Logging stopped" is now set per device.

- Each entry in **Configure Receiver > Allowed Senders** has its own **Alert If Silent For** limit. Leave it blank for devices that only log when something happens, such as many NAS systems, so they no longer raise false alerts.
- Existing single addresses keep the limit they had (15 minutes by default): clear it on the devices that should not be watched.
- **Configure Alerts** shows, under the rule's switch and after saving, which devices are watched and where to change that.`,
    es_ES: `"Registro detenido" se ajusta ahora por dispositivo.

- Cada entrada de **Configurar receptor > Remitentes permitidos** tiene su propio límite **Alertar si no envía durante**. Déjalo en blanco para dispositivos que solo registran cuando ocurre algo, como muchos NAS, para que ya no generen falsas alertas.
- Las direcciones individuales existentes conservan el límite que tenían (15 minutos por defecto): bórralo en los dispositivos que no deban vigilarse.
- **Configurar alertas** muestra, bajo el interruptor de la regla y al guardar, qué dispositivos se vigilan y dónde cambiarlo.`,
    de_DE: `„Protokollierung gestoppt“ wird jetzt pro Gerät eingestellt.

- Jeder Eintrag unter **Empfänger konfigurieren > Erlaubte Absender** hat ein eigenes Limit **Warnen, wenn still seit**. Lassen Sie es leer für Geräte, die nur bei Ereignissen protokollieren, etwa viele NAS-Systeme; sie lösen dann keine falschen Warnungen mehr aus.
- Bestehende Einzeladressen behalten ihr bisheriges Limit (standardmäßig 15 Minuten): leeren Sie es bei Geräten, die nicht überwacht werden sollen.
- **Warnungen konfigurieren** zeigt unter dem Schalter der Regel und nach dem Speichern, welche Geräte überwacht werden und wo man das ändert.`,
    pl_PL: `„Logowanie ustało” ustawia się teraz dla każdego urządzenia.

- Każdy wpis w **Skonfiguruj odbiornik > Dozwoleni nadawcy** ma własny limit **Alarm po ciszy trwającej**. Zostaw go pustym dla urządzeń, które logują tylko wtedy, gdy coś się dzieje, jak wiele serwerów NAS, aby nie wywoływały już fałszywych alertów.
- Istniejące pojedyncze adresy zachowują dotychczasowy limit (domyślnie 15 minut): wyczyść go dla urządzeń, które nie mają być obserwowane.
- **Skonfiguruj alerty** pokazuje pod przełącznikiem reguły i po zapisaniu, które urządzenia są obserwowane i gdzie to zmienić.`,
    fr_FR: `« Journalisation arrêtée » se règle désormais par appareil.

- Chaque entrée de **Configurer le récepteur > Expéditeurs autorisés** a sa propre limite **Alerter après un silence de**. Laissez-la vide pour les appareils qui ne journalisent que lorsqu'il se passe quelque chose, comme beaucoup de NAS : ils ne déclenchent plus de fausses alertes.
- Les adresses individuelles existantes gardent leur limite (15 minutes par défaut) : effacez-la pour les appareils à ne pas surveiller.
- **Configurer les alertes** indique, sous l'interrupteur de la règle et après l'enregistrement, quels appareils sont surveillés et où le modifier.`,
  },
  migrations: {
    up: silenceLimitPerSender,
    down: silenceLimitShared,
  },
})
