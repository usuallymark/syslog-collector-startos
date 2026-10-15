import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '8.2504.0:9',
  releaseNotes: {
    en_US: `Vaultwarden and ntfy on this server, and no Vaultwarden version limit.

- **On this server:** Configure Vaultwarden, and the ntfy server in Configure Alerts, now offer **On this server** next to **At an address**. Log Collector then reaches Start9's Vaultwarden or ntfy service over StartOS's internal network: no URL, IP address or certificate to enter, and nothing to update when an address or certificate changes. While chosen, they show as optional dependencies.
- **No Vaultwarden version limit:** the bundled rbw 1.15.0 signs in, unlocks, syncs and reads secrets with current Vaultwarden, tested with 1.37.4, the Vaultwarden package on StartOS. The earlier note saying otherwise was wrong and is removed. (rbw cannot create or edit vault items on Vaultwarden 1.37 and later; Log Collector only reads.)
- Existing settings stay **At an address** until you change them.`,
    es_ES: `Vaultwarden y ntfy en este servidor, y sin límite de versión de Vaultwarden.

- **En este servidor:** Configurar Vaultwarden, y el servidor ntfy en Configurar alertas, ofrecen ahora **En este servidor** junto a **En una dirección**. Log Collector llega entonces al servicio Vaultwarden o ntfy de Start9 por la red interna de StartOS: sin URL, dirección IP ni certificado que introducir, y nada que actualizar cuando cambie una dirección o un certificado. Mientras estén elegidos, aparecen como dependencias opcionales.
- **Sin límite de versión de Vaultwarden:** el rbw 1.15.0 incluido inicia sesión, desbloquea, sincroniza y lee secretos con Vaultwarden actual, probado con la 1.37.4, el paquete Vaultwarden de StartOS. La nota anterior que decía lo contrario era errónea y se ha eliminado. (rbw no puede crear ni editar elementos en Vaultwarden 1.37 y posteriores; Log Collector solo lee.)
- Los ajustes existentes siguen **En una dirección** hasta que los cambies.`,
    de_DE: `Vaultwarden und ntfy auf diesem Server, und keine Vaultwarden-Versionsgrenze mehr.

- **Auf diesem Server:** Vaultwarden konfigurieren und der ntfy-Server unter Warnungen konfigurieren bieten jetzt **Auf diesem Server** neben **Unter einer Adresse**. Log Collector erreicht dann den Vaultwarden- oder ntfy-Dienst von Start9 über das interne Netzwerk von StartOS: keine URL, IP-Adresse oder Zertifikat einzugeben, und nichts anzupassen, wenn sich eine Adresse oder ein Zertifikat ändert. Solange gewählt, erscheinen sie als optionale Abhängigkeiten.
- **Keine Vaultwarden-Versionsgrenze:** Das mitgelieferte rbw 1.15.0 meldet sich an, entsperrt, synchronisiert und liest Geheimnisse mit aktuellem Vaultwarden, getestet mit 1.37.4, dem Vaultwarden-Paket von StartOS. Der frühere gegenteilige Hinweis war falsch und ist entfernt. (rbw kann unter Vaultwarden 1.37 und neuer keine Einträge anlegen oder ändern; Log Collector liest nur.)
- Bestehende Einstellungen bleiben bei **Unter einer Adresse**, bis Sie sie ändern.`,
    pl_PL: `Vaultwarden i ntfy na tym serwerze oraz brak limitu wersji Vaultwarden.

- **Na tym serwerze:** Skonfiguruj Vaultwarden oraz serwer ntfy w Skonfiguruj alerty oferują teraz **Na tym serwerze** obok **Pod adresem**. Log Collector łączy się wtedy z usługą Vaultwarden lub ntfy od Start9 przez wewnętrzną sieć StartOS: bez URL, adresu IP ani certyfikatu do wpisania i bez aktualizacji, gdy zmieni się adres lub certyfikat. Gdy są wybrane, pojawiają się jako opcjonalne zależności.
- **Brak limitu wersji Vaultwarden:** dołączony rbw 1.15.0 loguje się, odblokowuje, synchronizuje i odczytuje sekrety z aktualnym Vaultwarden, przetestowane z 1.37.4, pakietem Vaultwarden w StartOS. Wcześniejsza informacja, że jest inaczej, była błędna i została usunięta. (rbw nie może tworzyć ani edytować elementów w Vaultwarden 1.37 i nowszym; Log Collector tylko odczytuje.)
- Istniejące ustawienia pozostają **Pod adresem**, dopóki ich nie zmienisz.`,
    fr_FR: `Vaultwarden et ntfy sur ce serveur, et plus de limite de version de Vaultwarden.

- **Sur ce serveur :** Configurer Vaultwarden, et le serveur ntfy dans Configurer les alertes, proposent désormais **Sur ce serveur** à côté de **À une adresse**. Log Collector joint alors le service Vaultwarden ou ntfy de Start9 par le réseau interne de StartOS : aucune URL, adresse IP ni certificat à saisir, et rien à mettre à jour quand une adresse ou un certificat change. Tant qu'ils sont choisis, ils apparaissent comme dépendances facultatives.
- **Plus de limite de version de Vaultwarden :** le rbw 1.15.0 intégré se connecte, déverrouille, synchronise et lit les secrets avec Vaultwarden actuel, testé avec la 1.37.4, le paquet Vaultwarden de StartOS. L'ancienne note affirmant le contraire était fausse et est supprimée. (rbw ne peut pas créer ni modifier d'éléments sur Vaultwarden 1.37 et plus récent ; Log Collector ne fait que lire.)
- Les réglages existants restent sur **À une adresse** jusqu'à ce que vous les changiez.`,
  },
  migrations: {
    up: async () => {},
    down: async () => {},
  },
})
