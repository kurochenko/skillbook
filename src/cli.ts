#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: {
    name: 'skillbook',
    version: '0.1.0',
    description: 'Manage AI coding assistant skills across projects',
  },
  subCommands: {
    add: () => import('./commands/add.ts').then((m) => m.default),
    init: () => import('./commands/init.ts').then((m) => m.default),
    list: () => import('./commands/list.ts').then((m) => m.default),
  },
})

runMain(main)
