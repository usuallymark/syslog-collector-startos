import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '8.2504.0:5',
  releaseNotes: {
    en_US: `An open receiver is now flagged.

- Without a sender allow-list, the **Rejected Senders** health check fails with "Danger: No allow-list: every sender is accepted", and a task asks you to add your devices in Configure Receiver. Both go away once a list is saved.
- Messages are still accepted until then, so a first test works.`,
    es_ES: `Ahora se señala un receptor abierto.

- Sin lista de remitentes permitidos, la comprobación **Remitentes rechazados** falla con "Peligro: sin lista de permitidos: se acepta a todos los remitentes", y una tarea te pide añadir tus dispositivos en Configurar receptor. Ambas desaparecen al guardar una lista.
- Hasta entonces se siguen aceptando mensajes, así que una primera prueba funciona.`,
    de_DE: `Ein offener Empfänger wird jetzt markiert.

- Ohne Liste erlaubter Absender schlägt die Prüfung **Abgelehnte Absender** fehl mit „Gefahr: Keine Liste erlaubter Absender: jeder Absender wird angenommen“, und eine Aufgabe bittet Sie, Ihre Geräte unter Empfänger konfigurieren einzutragen. Beides verschwindet, sobald eine Liste gespeichert ist.
- Bis dahin werden Meldungen weiter angenommen, ein erster Test funktioniert also.`,
    pl_PL: `Otwarty odbiornik jest teraz oznaczany.

- Bez listy dozwolonych nadawców kontrola **Odrzuceni nadawcy** zgłasza błąd „Niebezpieczeństwo: brak listy dozwolonych: każdy nadawca jest przyjmowany”, a zadanie prosi o dodanie urządzeń w Skonfiguruj odbiornik. Oba znikają po zapisaniu listy.
- Do tego czasu wiadomości są nadal przyjmowane, więc pierwszy test działa.`,
    fr_FR: `Un récepteur ouvert est désormais signalé.

- Sans liste d'expéditeurs autorisés, la vérification **Expéditeurs rejetés** échoue avec « Danger : pas de liste d'autorisation : tous les expéditeurs sont acceptés », et une tâche vous demande d'ajouter vos appareils dans Configurer le récepteur. Les deux disparaissent dès qu'une liste est enregistrée.
- D'ici là, les messages restent acceptés : un premier test fonctionne.`,
  },
  migrations: {
    up: async () => {},
    down: async () => {},
  },
})
