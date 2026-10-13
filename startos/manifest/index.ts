import { setupManifest } from '@start9labs/start-sdk'
import { RSYSLOG_VERSION } from '../utils'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'syslog-collector',
  title: 'Log Collector',
  license: 'MIT',
  packageRepo: 'https://github.com/usuallymark/syslog-collector-startos',
  upstreamRepo: 'https://github.com/rsyslog/rsyslog',
  marketingUrl: 'https://www.rsyslog.com/',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    rsyslog: {
      source: {
        dockerBuild: {
          workdir: '.',
          buildArgs: { RSYSLOG_VERSION },
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
})
