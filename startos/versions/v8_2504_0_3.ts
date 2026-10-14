import { VersionInfo } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// The "Vaultwarden on this server" login is gone: settings that used it fall
// back to "Enter here", and the NAS Copy check asks for the login.
async function dropLocalVaultwarden() {
  const path = 'settings.json'
  let raw: { nas?: { credentialSource?: string } }
  try {
    raw = JSON.parse(String(await sdk.volumes.main.readFile(path, 'utf8')))
  } catch {
    return
  }
  if (raw.nas?.credentialSource === 'vaultwarden') {
    raw.nas.credentialSource = 'manual'
    await sdk.volumes.main.writeFile(path, JSON.stringify(raw, null, 2))
  }
}

export const v8_2504_0_3 = VersionInfo.of({
  version: '8.2504.0:3',
  releaseNotes: {
    en_US: `Vaultwarden login: one option that works, and its limit stated.

- **"From Vaultwarden on this server" is removed.** The bundled rbw 1.15.0 (the newest release) cannot sign in to Vaultwarden 1.36 or later, and the Vaultwarden package on StartOS is newer than that, so the option could never work. Installs that chose it fall back to "Enter here".
- **"From Vaultwarden"** (at a URL, as before) works with Vaultwarden up to 1.35.x. The form says so, and a failed sign-in now says so too.`,
    es_ES: `Inicio de sesión con Vaultwarden: una opción que funciona y su límite indicado.

- **Se elimina "Desde Vaultwarden en este servidor".** El rbw 1.15.0 incluido (la versión más reciente) no puede iniciar sesión en Vaultwarden 1.36 o posterior, y el paquete de Vaultwarden de StartOS es más nuevo, así que la opción nunca podía funcionar. Las instalaciones que la usaban pasan a "Introducir aquí".
- **"Desde Vaultwarden"** (en una URL, como antes) funciona con Vaultwarden hasta la 1.35.x. El formulario lo indica, y un inicio de sesión fallido también.`,
    de_DE: `Vaultwarden-Anmeldung: eine Option, die funktioniert, mit genannter Grenze.

- **„Aus Vaultwarden auf diesem Server“ entfällt.** Das mitgelieferte rbw 1.15.0 (die neueste Version) kann sich nicht bei Vaultwarden 1.36 oder neuer anmelden, und das Vaultwarden-Paket von StartOS ist neuer, daher konnte die Option nie funktionieren. Installationen damit wechseln zu „Hier eingeben“.
- **„Aus Vaultwarden“** (unter einer URL, wie bisher) funktioniert mit Vaultwarden bis 1.35.x. Das Formular sagt es, und eine fehlgeschlagene Anmeldung jetzt auch.`,
    pl_PL: `Logowanie przez Vaultwarden: jedna działająca opcja i podany limit.

- **Usunięto „Z Vaultwarden na tym serwerze”.** Dołączony rbw 1.15.0 (najnowsze wydanie) nie potrafi zalogować się do Vaultwarden 1.36 lub nowszego, a pakiet Vaultwarden w StartOS jest nowszy, więc ta opcja nigdy nie mogła działać. Instalacje, które ją wybrały, przechodzą na „Wpisz tutaj”.
- **„Z Vaultwarden”** (pod adresem URL, jak dotąd) działa z Vaultwarden do wersji 1.35.x. Formularz to podaje, a nieudane logowanie również.`,
    fr_FR: `Identifiant via Vaultwarden : une option qui fonctionne, et sa limite indiquée.

- **« Depuis Vaultwarden sur ce serveur » est supprimé.** Le rbw 1.15.0 intégré (la dernière version) ne peut pas se connecter à Vaultwarden 1.36 ou plus récent, et le paquet Vaultwarden de StartOS est plus récent : l'option ne pouvait donc jamais fonctionner. Les installations qui l'utilisaient passent à « Saisir ici ».
- **« Depuis Vaultwarden »** (à une URL, comme avant) fonctionne avec Vaultwarden jusqu'à 1.35.x. Le formulaire l'indique, et une connexion échouée aussi.`,
  },
  migrations: {
    up: dropLocalVaultwarden,
    // :2 still knows "manual" and "vaultwarden-url"; nothing to undo.
    down: async () => {},
  },
})
