import { settingsJson } from './fileModels/settings.json'
import { sdk } from './sdk'
import { VAULTWARDEN_ID } from './utils'

// Vaultwarden is needed only while the NAS copy reads its login from it.
export const dependencies = sdk.Dependencies.of().addDependency(
  sdk.Dependency.optional(VAULTWARDEN_ID, {
    description: {
      en_US:
        'Optional: read the NAS login from Vaultwarden. Choose "From Vaultwarden on this server" in Configure NAS Copy.',
      es_ES:
        'Opcional: leer el inicio de sesión del NAS desde Vaultwarden. Elige "Desde Vaultwarden en este servidor" en Configurar copia al NAS.',
      de_DE:
        'Optional: die NAS-Anmeldung aus Vaultwarden lesen. Wählen Sie „Aus Vaultwarden auf diesem Server“ unter NAS-Kopie konfigurieren.',
      pl_PL:
        'Opcjonalnie: odczytuj dane logowania do NAS z Vaultwarden. Wybierz „Z Vaultwarden na tym serwerze” w Skonfiguruj kopię na NAS.',
      fr_FR:
        "Facultatif : lire l'identifiant du NAS dans Vaultwarden. Choisissez « Depuis Vaultwarden sur ce serveur » dans Configurer la copie vers le NAS.",
    },
    metadata: {
      title: { en_US: 'Vaultwarden' },
      icon: 'https://raw.githubusercontent.com/Start9Labs/vaultwarden-startos/master/icon.svg',
    },
    versionRange: '>=1.37.4:0',
    kind: 'running',
    healthChecks: ['primary'],
    enabled: async ({ effects }) => {
      const nas = await settingsJson.read((s) => s.nas).const(effects)
      return !!nas?.enabled && nas.credentialSource === 'vaultwarden'
    },
  }),
)
