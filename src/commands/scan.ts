import { defineCommand } from 'citty'
import { runScanApp } from '@/tui/ScanApp'

export default defineCommand({
  meta: {
    name: 'scan',
    description: 'Scan for skills and add them to your library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Directory to scan (defaults to current directory)',
      required: false,
    },
  },
  run: async ({ args }) => {
    const { path: basePath = '.' } = args
    runScanApp(basePath)
  },
})
