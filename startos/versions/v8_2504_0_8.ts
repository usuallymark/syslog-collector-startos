import { VersionInfo } from '@start9labs/start-sdk'

export const v8_2504_0_8 = VersionInfo.of({
  version: '8.2504.0:8',
  releaseNotes: {
    en_US: `Encrypted syslog (TLS), and a fix for phantom rejections.

- **TLS** (RFC 5425): turn on **Accept TLS** in Configure Receiver to receive encrypted syslog on its own port (6514 by default), next to plain UDP and TCP. The certificate is issued and renewed by your StartOS server; devices trust its root CA and connect using a name shown in the new **TLS** health check. Off by default.
- **Fix:** the last reject counters of the previous run were counted again when the service started, so **Rejected Senders** (and the "Unknown sender" alert) showed a new rejection from an address that had sent nothing. Counts already recorded are kept and age out after 30 days.`,
    es_ES: `Syslog cifrado (TLS) y una corrección de rechazos fantasma.

- **TLS** (RFC 5425): activa **Aceptar TLS** en Configurar receptor para recibir syslog cifrado en su propio puerto (6514 por defecto), junto a UDP y TCP sin cifrar. El certificado lo emite y renueva tu servidor StartOS; los dispositivos confían en su CA raíz y se conectan con un nombre que muestra la nueva comprobación **TLS**. Desactivado por defecto.
- **Corrección:** los últimos contadores de rechazos de la ejecución anterior se volvían a contar al iniciar el servicio, así que **Remitentes rechazados** (y la alerta "Remitente desconocido") mostraban un rechazo nuevo de una dirección que no había enviado nada. Los recuentos ya registrados se conservan y caducan a los 30 días.`,
    de_DE: `Verschlüsseltes Syslog (TLS) und eine Korrektur für Phantom-Ablehnungen.

- **TLS** (RFC 5425): Schalten Sie **TLS annehmen** unter Empfänger konfigurieren ein, um verschlüsseltes Syslog auf einem eigenen Port (standardmäßig 6514) zu empfangen, neben unverschlüsseltem UDP und TCP. Das Zertifikat stellt Ihr StartOS-Server aus und erneuert es; Geräte vertrauen seiner Root-CA und verbinden sich mit einem Namen, den die neue Prüfung **TLS** anzeigt. Standardmäßig aus.
- **Korrektur:** Die letzten Ablehnungszähler des vorherigen Laufs wurden beim Start des Dienstes erneut gezählt, sodass **Abgelehnte Absender** (und die Warnung „Unbekannter Absender“) eine neue Ablehnung einer Adresse zeigten, die nichts gesendet hatte. Bereits erfasste Zählungen bleiben erhalten und verfallen nach 30 Tagen.`,
    pl_PL: `Szyfrowany syslog (TLS) i poprawka fantomowych odrzuceń.

- **TLS** (RFC 5425): włącz **Przyjmuj TLS** w Skonfiguruj odbiornik, aby odbierać szyfrowany syslog na osobnym porcie (domyślnie 6514), obok nieszyfrowanego UDP i TCP. Certyfikat wystawia i odnawia Twój serwer StartOS; urządzenia ufają jego głównemu CA i łączą się, używając nazwy pokazanej w nowej kontroli **TLS**. Domyślnie wyłączone.
- **Poprawka:** ostatnie liczniki odrzuceń z poprzedniego uruchomienia były liczone ponownie przy starcie usługi, więc **Odrzuceni nadawcy** (i alert „Nieznany nadawca”) pokazywały nowe odrzucenie z adresu, który nic nie wysłał. Już zapisane liczby są zachowane i wygasają po 30 dniach.`,
    fr_FR: `Syslog chiffré (TLS) et correction des rejets fantômes.

- **TLS** (RFC 5425) : activez **Accepter TLS** dans Configurer le récepteur pour recevoir du syslog chiffré sur son propre port (6514 par défaut), à côté de l'UDP et du TCP non chiffrés. Le certificat est émis et renouvelé par votre serveur StartOS ; les appareils font confiance à son autorité racine et se connectent avec un nom affiché par la nouvelle vérification **TLS**. Désactivé par défaut.
- **Correctif :** les derniers compteurs de rejets de l'exécution précédente étaient recomptés au démarrage du service : **Expéditeurs rejetés** (et l'alerte « Expéditeur inconnu ») affichaient un nouveau rejet d'une adresse qui n'avait rien envoyé. Les décomptes déjà enregistrés sont conservés et expirent après 30 jours.`,
  },
  migrations: {
    up: async () => {},
    down: async () => {},
  },
})
