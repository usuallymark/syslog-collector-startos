import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'
import { v8_2504_0_0 } from './v8_2504_0_0'
import { v8_2504_0_1 } from './v8_2504_0_1'

export const versionGraph = VersionGraph.of({
  current,
  other: [v8_2504_0_1, v8_2504_0_0],
})
