import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const v8_2504_0_0 = VersionInfo.of({
  version: '8.2504.0:0',
  releaseNotes: {
    en_US:
      'First release: a syslog receiver (rsyslog 8.2504.0) that writes plain text files, one per device per day.',
    es_ES:
      'Primera versión: un receptor de syslog (rsyslog 8.2504.0) que escribe archivos de texto plano, uno por dispositivo y día.',
    de_DE:
      'Erste Version: ein Syslog-Empfänger (rsyslog 8.2504.0), der reine Textdateien schreibt, eine pro Gerät und Tag.',
    pl_PL:
      'Pierwsze wydanie: odbiornik syslog (rsyslog 8.2504.0), który zapisuje zwykłe pliki tekstowe, jeden na urządzenie na dzień.',
    fr_FR:
      'Première version : un récepteur syslog (rsyslog 8.2504.0) qui écrit des fichiers texte bruts, un par appareil et par jour.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
