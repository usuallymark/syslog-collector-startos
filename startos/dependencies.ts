import { settingsJson } from './fileModels/settings.json'
import { sdk } from './sdk'
import { NTFY_ID, VAULTWARDEN_ID } from './utils'

// Both optional, and active only while "On this server" is chosen for them:
// Vaultwarden in Configure Vaultwarden, ntfy in Configure Alerts. At an
// address, they can run anywhere and StartOS does not track them.
export const dependencies = sdk.Dependencies.of()
  .addDependency(
    sdk.Dependency.optional(VAULTWARDEN_ID, {
      description: {
        en_US:
          'Optional: read the NAS login and the ntfy token from Vaultwarden on this server. Choose "On this server" in Configure Vaultwarden.',
        es_ES:
          'Opcional: leer el inicio de sesión del NAS y el token de ntfy desde Vaultwarden en este servidor. Elige "En este servidor" en Configurar Vaultwarden.',
        de_DE:
          'Optional: die NAS-Anmeldung und das ntfy-Token aus Vaultwarden auf diesem Server lesen. Wählen Sie „Auf diesem Server“ unter Vaultwarden konfigurieren.',
        pl_PL:
          'Opcjonalnie: odczytuj dane logowania do NAS i token ntfy z Vaultwarden na tym serwerze. Wybierz „Na tym serwerze” w Skonfiguruj Vaultwarden.',
        fr_FR:
          "Facultatif : lire l'identifiant du NAS et le jeton ntfy dans Vaultwarden sur ce serveur. Choisissez « Sur ce serveur » dans Configurer Vaultwarden.",
      },
      metadata: {
        title: { en_US: 'Vaultwarden' },
        icon: 'https://raw.githubusercontent.com/Start9Labs/vaultwarden-startos/master/icon.svg',
      },
      versionRange: '>=1.37.4:0',
      kind: 'running',
      healthChecks: ['primary'],
      enabled: async ({ effects }) => {
        const v = await settingsJson.read((s) => s.vaultwarden).const(effects)
        return !!v?.enabled && v.location === 'local'
      },
    }),
  )
  .addDependency(
    sdk.Dependency.optional(NTFY_ID, {
      description: {
        en_US:
          'Optional: send alerts through ntfy on this server. Choose "On this server" for the ntfy server in Configure Alerts.',
        es_ES:
          'Opcional: enviar las alertas a través de ntfy en este servidor. Elige "En este servidor" como servidor ntfy en Configurar alertas.',
        de_DE:
          'Optional: Warnungen über ntfy auf diesem Server senden. Wählen Sie „Auf diesem Server“ als ntfy-Server unter Warnungen konfigurieren.',
        pl_PL:
          'Opcjonalnie: wysyłaj alerty przez ntfy na tym serwerze. Wybierz „Na tym serwerze” jako serwer ntfy w Skonfiguruj alerty.',
        fr_FR:
          'Facultatif : envoyer les alertes via ntfy sur ce serveur. Choisissez « Sur ce serveur » comme serveur ntfy dans Configurer les alertes.',
      },
      metadata: {
        title: { en_US: 'ntfy' },
        icon: 'https://raw.githubusercontent.com/Start9Labs/ntfy-startos/master/icon.svg',
      },
      versionRange: '>=2.28.0:1',
      kind: 'running',
      healthChecks: ['primary'],
      enabled: async ({ effects }) => {
        const a = await settingsJson.read((s) => s.alerts).const(effects)
        return !!a?.enabled && a.ntfyLocation === 'local'
      },
    }),
  )
