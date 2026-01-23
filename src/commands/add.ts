import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the skill file',
      required: true,
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing skill',
      default: false,
    },
  },
  run: async ({ args }) => {
    console.log('TODO: Implement add command')
    console.log('Path:', args.path)
    console.log('Force:', args.force)
  },
})
