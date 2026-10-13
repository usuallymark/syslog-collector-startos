import { VersionInfo } from '@start9labs/start-sdk'
import { mkdir, rm } from 'node:fs/promises'
import { sdk } from '../sdk'

export const current = VersionInfo.of({
  version: '8.2504.0:2',
  releaseNotes: {
    en_US: `Vaultwarden on another server, and tighter password storage.

- **Vaultwarden at an address.** Configure NAS Copy can read the NAS login from a Vaultwarden that runs elsewhere: enter its URL, and if needed the IP address for a .local name and your own CA certificate.
- **Passwords are kept in one root-only file.** The extra copy of the Vaultwarden master password is removed, and the NAS password is no longer written into the container's settings.`,
    es_ES: `Vaultwarden en otro servidor y contraseñas mejor guardadas.

- **Vaultwarden en una dirección.** Configurar copia al NAS puede leer el inicio de sesión del NAS de un Vaultwarden que funciona en otro lugar: introduce su URL y, si hace falta, la dirección IP para un nombre .local y tu propio certificado de CA.
- **Las contraseñas se guardan en un único archivo solo para root.** Se elimina la copia adicional de la contraseña maestra de Vaultwarden y la contraseña del NAS ya no se escribe en la configuración del contenedor.`,
    de_DE: `Vaultwarden auf einem anderen Server und sicherer gespeicherte Passwörter.

- **Vaultwarden unter einer Adresse.** NAS-Kopie konfigurieren kann die NAS-Anmeldung aus einem Vaultwarden lesen, der anderswo läuft: URL eingeben und bei Bedarf die IP-Adresse für einen .local-Namen sowie Ihr eigenes CA-Zertifikat.
- **Passwörter liegen in einer einzigen Datei, die nur root lesen kann.** Die zusätzliche Kopie des Vaultwarden-Master-Passworts wird entfernt, und das NAS-Passwort wird nicht mehr in die Einstellungen des Containers geschrieben.`,
    pl_PL: `Vaultwarden na innym serwerze i lepiej przechowywane hasła.

- **Vaultwarden pod adresem.** Skonfiguruj kopię na NAS może odczytać dane logowania do NAS z Vaultwarden działającego gdzie indziej: wpisz jego URL i w razie potrzeby adres IP dla nazwy .local oraz własny certyfikat CA.
- **Hasła są w jednym pliku dostępnym tylko dla roota.** Dodatkowa kopia hasła głównego Vaultwarden jest usuwana, a hasło do NAS nie jest już zapisywane w ustawieniach kontenera.`,
    fr_FR: `Vaultwarden sur un autre serveur, et mots de passe mieux protégés.

- **Vaultwarden à une adresse.** Configurer la copie vers le NAS peut lire l'identifiant du NAS dans un Vaultwarden qui tourne ailleurs : saisissez son URL et, si besoin, l'adresse IP d'un nom .local et votre propre certificat d'autorité.
- **Les mots de passe sont dans un seul fichier réservé à root.** La copie supplémentaire du mot de passe principal Vaultwarden est supprimée, et le mot de passe du NAS n'est plus écrit dans la configuration du conteneur.`,
  },
  migrations: {
    // 8.2504.0:1 kept a second copy of the master password for rbw.
    up: async () => {
      await rm(sdk.volumes.main.subpath('rbw/master-password'), {
        force: true,
      })
    },
    // 8.2504.0:1 reads the master password from that second copy. (It has
    // no "vaultwarden-url" login; that choice falls back to "Enter here".)
    down: async () => {
      try {
        const s = JSON.parse(
          String(await sdk.volumes.main.readFile('secrets.json', 'utf8')),
        ) as { vaultMasterPassword?: string }
        if (s.vaultMasterPassword) {
          await mkdir(sdk.volumes.main.subpath('rbw'), { recursive: true })
          await sdk.volumes.main.writeFile(
            'rbw/master-password',
            s.vaultMasterPassword,
            { mode: 0o600 },
          )
        }
      } catch {
        // no secrets saved: nothing to restore
      }
    },
  },
})
