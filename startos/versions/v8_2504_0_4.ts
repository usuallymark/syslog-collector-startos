import { VersionInfo } from '@start9labs/start-sdk'

export const v8_2504_0_4 = VersionInfo.of({
  version: '8.2504.0:4',
  releaseNotes: {
    en_US: `Sender allow-list.

- **Allowed Senders** in Configure Receiver: IPv4 addresses, IPv4 CIDR ranges or IPv6 addresses. Messages from any other address are dropped before they are written, judged by the address they come from, not by the hostname inside them. An empty list accepts every sender, as before.
- **Rejected Senders** health check: the last rejected address, when, and how many lines were dropped from it. Rejected lines are only counted, never stored, and the service log notes each address at most once an hour.`,
    es_ES: `Lista de remitentes permitidos.

- **Remitentes permitidos** en Configurar receptor: direcciones IPv4, rangos CIDR IPv4 o direcciones IPv6. Los mensajes de cualquier otra dirección se descartan antes de escribirse, según la dirección de la que vienen y no según el nombre de host que contienen. Una lista vacía acepta a todos los remitentes, como antes.
- Comprobación **Remitentes rechazados**: la última dirección rechazada, cuándo y cuántas líneas suyas se descartaron. Las líneas rechazadas solo se cuentan, nunca se guardan, y el registro del servicio anota cada dirección como mucho una vez por hora.`,
    de_DE: `Liste erlaubter Absender.

- **Erlaubte Absender** unter Empfänger konfigurieren: IPv4-Adressen, IPv4-CIDR-Bereiche oder IPv6-Adressen. Meldungen von jeder anderen Adresse werden verworfen, bevor sie geschrieben werden, beurteilt nach der Adresse, von der sie kommen, nicht nach dem Hostnamen darin. Eine leere Liste nimmt wie bisher jeden Absender an.
- Prüfung **Abgelehnte Absender**: die zuletzt abgelehnte Adresse, wann und wie viele Zeilen von ihr verworfen wurden. Abgelehnte Zeilen werden nur gezählt, nie gespeichert, und das Dienstprotokoll vermerkt jede Adresse höchstens einmal pro Stunde.`,
    pl_PL: `Lista dozwolonych nadawców.

- **Dozwoleni nadawcy** w Skonfiguruj odbiornik: adresy IPv4, zakresy CIDR IPv4 lub adresy IPv6. Wiadomości z każdego innego adresu są odrzucane, zanim zostaną zapisane, na podstawie adresu, z którego przychodzą, a nie nazwy hosta w nich. Pusta lista przyjmuje każdego nadawcę, jak dotąd.
- Kontrola **Odrzuceni nadawcy**: ostatni odrzucony adres, kiedy i ile jego linii odrzucono. Odrzucone linie są tylko liczone, nigdy zapisywane, a log usługi odnotowuje każdy adres najwyżej raz na godzinę.`,
    fr_FR: `Liste des expéditeurs autorisés.

- **Expéditeurs autorisés** dans Configurer le récepteur : adresses IPv4, plages CIDR IPv4 ou adresses IPv6. Les messages de toute autre adresse sont écartés avant d'être écrits, d'après l'adresse d'où ils viennent et non d'après le nom d'hôte qu'ils contiennent. Une liste vide accepte tous les expéditeurs, comme avant.
- Vérification **Expéditeurs rejetés** : la dernière adresse rejetée, quand, et combien de lignes en ont été écartées. Les lignes rejetées sont seulement comptées, jamais stockées, et le journal du service note chaque adresse au plus une fois par heure.`,
  },
  migrations: {
    up: async () => {},
    // Older versions keep the list in settings.json but ignore it.
    down: async () => {},
  },
})
