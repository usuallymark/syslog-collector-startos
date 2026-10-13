import { VersionInfo } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// 8.2504.0:0 named folders "hostname" (as sent) or "ip". "hostname" becomes
// the new default, short hostnames; going back maps both hostname choices to
// the old "hostname".
async function renameFolderNaming(from: string[], to: string) {
  const path = 'settings.json'
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(String(await sdk.volumes.main.readFile(path, 'utf8')))
  } catch {
    return // no settings yet: init writes the defaults
  }
  if (typeof raw.folderNaming === 'string' && from.includes(raw.folderNaming)) {
    raw.folderNaming = to
    await sdk.volumes.main.writeFile(path, JSON.stringify(raw, null, 2))
  }
}

export const current = VersionInfo.of({
  version: '8.2504.0:1',
  releaseNotes: {
    en_US: `NAS copy, a time zone picker, and tidier lines.

- **NAS copy (new, off by default).** Configure NAS Copy copies the daily files to a shared folder on a NAS (SMB) on a schedule, from every 5 minutes to once a day, and deletes old files there after a number of days you choose. The NAS login is entered there or read from Vaultwarden on this server. Push Now copies at once, and the NAS Copy health check shows the last result. While the copy is on, a file is only deleted from this server once it is on the NAS.
- **Time zone picker.** Choose a region, then a city, instead of typing the name.
- **Short hostnames.** Folders are named after the device's short hostname by default (firewall instead of firewall.home.arpa). Configure Receiver offers short, as sent, or IP address. Installs that used the hostname switch to short names: new files go to new folders, older files stay where they are.
- **Every line has "program[pid]:"**, also for devices that send RFC 5424 syslog.`,
    es_ES: `Copia al NAS, selector de zona horaria y líneas más uniformes.

- **Copia al NAS (nueva, desactivada por defecto).** Configurar copia al NAS copia los archivos diarios a una carpeta compartida de un NAS (SMB) según un horario, de cada 5 minutos a una vez al día, y borra allí los archivos antiguos tras los días que elijas. El inicio de sesión del NAS se introduce ahí o se lee de Vaultwarden en este servidor. Copiar ahora copia de inmediato, y la comprobación Copia al NAS muestra el último resultado. Mientras la copia está activa, un archivo solo se borra de este servidor cuando ya está en el NAS.
- **Selector de zona horaria.** Elige una región y luego una ciudad, en lugar de escribir el nombre.
- **Nombres de host cortos.** Las carpetas se nombran por defecto con el nombre corto del dispositivo (firewall en lugar de firewall.home.arpa). Configurar receptor ofrece corto, tal como se envía o dirección IP. Las instalaciones que usaban el nombre de host pasan a nombres cortos: los archivos nuevos van a carpetas nuevas y los antiguos se quedan donde están.
- **Cada línea lleva "programa[pid]:"**, también para los dispositivos que envían syslog RFC 5424.`,
    de_DE: `NAS-Kopie, Zeitzonenauswahl und einheitlichere Zeilen.

- **NAS-Kopie (neu, standardmäßig aus).** NAS-Kopie konfigurieren kopiert die Tagesdateien nach Zeitplan in einen freigegebenen Ordner auf einem NAS (SMB), von alle 5 Minuten bis einmal täglich, und löscht dort alte Dateien nach einer wählbaren Anzahl von Tagen. Die NAS-Anmeldung wird dort eingegeben oder aus Vaultwarden auf diesem Server gelesen. Jetzt kopieren kopiert sofort, und die Prüfung NAS-Kopie zeigt das letzte Ergebnis. Solange die Kopie an ist, wird eine Datei auf diesem Server erst gelöscht, wenn sie auf dem NAS liegt.
- **Zeitzonenauswahl.** Region und dann Stadt wählen, statt den Namen einzutippen.
- **Kurze Hostnamen.** Ordner heißen standardmäßig nach dem kurzen Hostnamen des Geräts (firewall statt firewall.home.arpa). Empfänger konfigurieren bietet kurz, wie gesendet oder IP-Adresse. Installationen mit Hostnamen wechseln zu kurzen Namen: neue Dateien landen in neuen Ordnern, ältere bleiben, wo sie sind.
- **Jede Zeile hat „Programm[pid]:“**, auch bei Geräten, die Syslog nach RFC 5424 senden.`,
    pl_PL: `Kopia na NAS, wybór strefy czasowej i bardziej jednolite linie.

- **Kopia na NAS (nowa, domyślnie wyłączona).** Skonfiguruj kopię na NAS kopiuje pliki dzienne do folderu udostępnionego na NAS (SMB) według harmonogramu, od co 5 minut do raz dziennie, i usuwa tam stare pliki po wybranej liczbie dni. Dane logowania do NAS wpisuje się tam lub odczytuje z Vaultwarden na tym serwerze. Kopiuj teraz kopiuje od razu, a kontrola Kopia na NAS pokazuje ostatni wynik. Gdy kopia jest włączona, plik jest usuwany z tego serwera dopiero, gdy jest już na NAS.
- **Wybór strefy czasowej.** Wybierz region, a potem miasto, zamiast wpisywać nazwę.
- **Krótkie nazwy hostów.** Foldery domyślnie nazywają się krótką nazwą hosta urządzenia (firewall zamiast firewall.home.arpa). Skonfiguruj odbiornik oferuje krótką, jak wysłano lub adres IP. Instalacje używające nazwy hosta przechodzą na krótkie nazwy: nowe pliki trafiają do nowych folderów, starsze zostają na miejscu.
- **Każda linia ma „program[pid]:”**, także dla urządzeń wysyłających syslog RFC 5424.`,
    fr_FR: `Copie vers le NAS, sélecteur de fuseau horaire et lignes plus uniformes.

- **Copie vers le NAS (nouveau, désactivé par défaut).** Configurer la copie vers le NAS copie les fichiers quotidiens dans un dossier partagé d'un NAS (SMB) selon un calendrier, de toutes les 5 minutes à une fois par jour, et y supprime les anciens fichiers après le nombre de jours choisi. L'identifiant du NAS se saisit là ou se lit dans Vaultwarden sur ce serveur. Copier maintenant copie immédiatement, et la vérification Copie vers le NAS affiche le dernier résultat. Tant que la copie est active, un fichier n'est supprimé de ce serveur qu'une fois sur le NAS.
- **Sélecteur de fuseau horaire.** Choisissez une région, puis une ville, au lieu de taper le nom.
- **Noms d'hôte courts.** Les dossiers portent par défaut le nom d'hôte court de l'appareil (firewall au lieu de firewall.home.arpa). Configurer le récepteur propose court, tel qu'envoyé ou adresse IP. Les installations qui utilisaient le nom d'hôte passent aux noms courts : les nouveaux fichiers vont dans de nouveaux dossiers, les anciens restent où ils sont.
- **Chaque ligne porte « programme[pid]: »**, y compris pour les appareils qui envoient du syslog RFC 5424.`,
  },
  migrations: {
    up: async () => renameFolderNaming(['hostname'], 'short'),
    down: async () => renameFolderNaming(['short', 'full'], 'hostname'),
  },
})
