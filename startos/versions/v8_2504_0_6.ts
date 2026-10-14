import { VersionInfo } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

type Raw = {
  nas?: Record<string, unknown>
  vaultwarden?: Record<string, unknown>
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

// Up to 8.2504.0:5 the Vaultwarden connection lived in the NAS settings,
// with the login source "vaultwarden-url". It is now its own section,
// shared by the NAS copy and alerts.
async function vaultwardenOutOfNas() {
  const raw = await readRaw()
  if (!raw?.nas) return
  const n = raw.nas
  const used = n.credentialSource === 'vaultwarden-url'
  if (!raw.vaultwarden && (used || n.vaultUrl)) {
    raw.vaultwarden = {
      enabled: used,
      url: n.vaultUrl ?? '',
      ip: n.vaultIp ?? '',
      ca: n.vaultCa ?? '',
      email: n.vaultEmail ?? '',
    }
  }
  if (used) n.credentialSource = 'vaultwarden'
  delete n.vaultUrl
  delete n.vaultIp
  delete n.vaultCa
  delete n.vaultEmail
  await writeRaw(raw)
}

async function vaultwardenIntoNas() {
  const raw = await readRaw()
  if (!raw?.nas) return
  const v = raw.vaultwarden ?? {}
  const n = raw.nas
  n.vaultUrl = v.url ?? ''
  n.vaultIp = v.ip ?? ''
  n.vaultCa = v.ca ?? ''
  n.vaultEmail = v.email ?? ''
  if (n.credentialSource === 'vaultwarden')
    n.credentialSource = 'vaultwarden-url'
  delete raw.vaultwarden
  await writeRaw(raw)
}

export const v8_2504_0_6 = VersionInfo.of({
  version: '8.2504.0:6',
  releaseNotes: {
    en_US: `Real-time alerts through ntfy (off until you set them up).

- **Configure Alerts**: ntfy server, topic and optional access token (entered, or read from Vaultwarden), dry run, cooldown, and an optional NAS folder for the alert records.
- **Configure Vaultwarden** is now its own action, shared by the NAS copy and alerts, with a **Vaultwarden** health check (unlock and sync). The NAS copy's existing Vaultwarden details move there by themselves; the NAS form now only asks for the item name.
- **Built-in rules, none tied to a device brand**: logging stopped (and resumed) on an allowed sender, unknown sender, high-severity syslog message, volume spike, collector problem (NAS copy failing, disk almost full), and bursts of failed logins (OpenSSH/PAM wording). Each can be switched off and tuned.
- **Custom rules**: alert on lines containing your own text, optionally per device and after several matches.
- Notifications never contain log text, only the rule, the device and a count. Each alert is recorded with the files and line numbers that triggered it, in alerts/YYYY-MM-DD.jsonl.
- **Send Test Alert** action and an **Alerts** health check.`,
    es_ES: `Alertas en tiempo real mediante ntfy (desactivadas hasta que las configures).

- **Configurar alertas**: servidor ntfy, tema y token de acceso opcional (introducido o leído de Vaultwarden), simulación, pausa y una carpeta opcional del NAS para los registros de alertas.
- **Configurar Vaultwarden** es ahora una acción propia, compartida por la copia al NAS y las alertas, con una comprobación **Vaultwarden** (desbloqueo y sincronización). Los datos de Vaultwarden de la copia al NAS se trasladan solos; el formulario del NAS solo pide el nombre del elemento.
- **Reglas incluidas, ninguna ligada a una marca de dispositivo**: registro detenido (y reanudado) en un remitente permitido, remitente desconocido, mensaje syslog de gravedad alta, pico de volumen, problema del colector (copia al NAS fallando, disco casi lleno) y ráfagas de inicios de sesión fallidos (texto de OpenSSH/PAM). Cada una se puede desactivar y ajustar.
- **Reglas propias**: alertar sobre líneas que contienen tu propio texto, opcionalmente por dispositivo y tras varias coincidencias.
- Las notificaciones nunca contienen texto de los registros, solo la regla, el dispositivo y un recuento. Cada alerta se registra con los archivos y números de línea que la activaron, en alerts/AAAA-MM-DD.jsonl.
- Acción **Enviar alerta de prueba** y comprobación **Alertas**.`,
    de_DE: `Echtzeit-Warnungen über ntfy (aus, bis Sie sie einrichten).

- **Warnungen konfigurieren**: ntfy-Server, Topic und optionales Zugriffstoken (eingegeben oder aus Vaultwarden gelesen), Probelauf, Ruhezeit und ein optionaler NAS-Ordner für die Warnungsprotokolle.
- **Vaultwarden konfigurieren** ist jetzt eine eigene Aktion, die NAS-Kopie und Warnungen gemeinsam nutzen, mit einer Prüfung **Vaultwarden** (Entsperren und Synchronisieren). Die bisherigen Vaultwarden-Angaben der NAS-Kopie werden automatisch übernommen; das NAS-Formular fragt nur noch nach dem Eintrag.
- **Eingebaute Regeln, keine an eine Gerätemarke gebunden**: Protokollierung gestoppt (und wieder aufgenommen) bei einem erlaubten Absender, unbekannter Absender, Syslog-Meldung hoher Schwere, Mengenspitze, Problem des Collectors (NAS-Kopie schlägt fehl, Datenträger fast voll) und gehäufte Anmeldefehler (OpenSSH/PAM-Wortlaut). Jede kann ausgeschaltet und angepasst werden.
- **Eigene Regeln**: warnen bei Zeilen mit Ihrem eigenen Text, optional pro Gerät und nach mehreren Treffern.
- Benachrichtigungen enthalten nie Logtext, nur Regel, Gerät und Anzahl. Jede Warnung wird mit den auslösenden Dateien und Zeilennummern in alerts/JJJJ-MM-TT.jsonl aufgezeichnet.
- Aktion **Testwarnung senden** und Prüfung **Warnungen**.`,
    pl_PL: `Alerty w czasie rzeczywistym przez ntfy (wyłączone, dopóki ich nie skonfigurujesz).

- **Skonfiguruj alerty**: serwer ntfy, temat i opcjonalny token dostępu (wpisany lub odczytany z Vaultwarden), tryb próby, wyciszenie i opcjonalny folder NAS na zapisy alertów.
- **Skonfiguruj Vaultwarden** to teraz osobna akcja, wspólna dla kopii na NAS i alertów, z kontrolą **Vaultwarden** (odblokowanie i synchronizacja). Dotychczasowe dane Vaultwarden z kopii na NAS są przenoszone automatycznie; formularz NAS pyta już tylko o nazwę elementu.
- **Reguły wbudowane, żadna nie jest związana z marką urządzenia**: logowanie ustało (i wznowione) u dozwolonego nadawcy, nieznany nadawca, wiadomość syslog o wysokiej ważności, skok liczby wiadomości, problem kolektora (kopia na NAS nie działa, dysk prawie pełny) i serie nieudanych logowań (komunikaty OpenSSH/PAM). Każdą można wyłączyć i dostroić.
- **Własne reguły**: alarm przy liniach zawierających Twój tekst, opcjonalnie dla wybranych urządzeń i po kilku dopasowaniach.
- Powiadomienia nigdy nie zawierają tekstu logów, tylko regułę, urządzenie i liczbę. Każdy alert jest zapisywany z plikami i numerami linii, które go wywołały, w alerts/RRRR-MM-DD.jsonl.
- Akcja **Wyślij alert testowy** i kontrola **Alerty**.`,
    fr_FR: `Alertes en temps réel via ntfy (désactivées tant que vous ne les configurez pas).

- **Configurer les alertes** : serveur ntfy, sujet et jeton d'accès facultatif (saisi ou lu dans Vaultwarden), simulation, délai de répit et un dossier NAS facultatif pour les enregistrements d'alertes.
- **Configurer Vaultwarden** est désormais une action à part, partagée par la copie vers le NAS et les alertes, avec une vérification **Vaultwarden** (déverrouillage et synchronisation). Les données Vaultwarden existantes de la copie vers le NAS y sont reprises automatiquement ; le formulaire NAS ne demande plus que le nom de l'élément.
- **Règles intégrées, aucune liée à une marque d'appareil** : journalisation arrêtée (et reprise) chez un expéditeur autorisé, expéditeur inconnu, message syslog de gravité élevée, pic de volume, problème du collecteur (copie vers le NAS en échec, disque presque plein) et rafales d'échecs de connexion (textes OpenSSH/PAM). Chacune peut être désactivée et réglée.
- **Règles personnalisées** : alerter sur les lignes contenant votre propre texte, éventuellement par appareil et après plusieurs correspondances.
- Les notifications ne contiennent jamais de texte des journaux, seulement la règle, l'appareil et un nombre. Chaque alerte est enregistrée avec les fichiers et numéros de ligne qui l'ont déclenchée, dans alerts/AAAA-MM-JJ.jsonl.
- Action **Envoyer une alerte de test** et vérification **Alertes**.`,
  },
  migrations: {
    up: vaultwardenOutOfNas,
    // Older versions keep the alert settings in settings.json but ignore them.
    down: vaultwardenIntoNas,
  },
})
