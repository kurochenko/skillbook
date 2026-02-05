import { EventEmitter } from 'node:events'
import { render as inkRender, type ReactNode } from 'ink'

class TestStdout extends EventEmitter {
  columns = 100
  rows: number
  frames: string[] = []
  _lastFrame: string | undefined

  constructor(rows: number) {
    super()
    this.rows = rows
  }

  write = (frame: string) => {
    this.frames.push(frame)
    this._lastFrame = frame
  }

  lastFrame = () => this._lastFrame
}

class TestStderr extends EventEmitter {
  frames: string[] = []
  _lastFrame: string | undefined

  write = (frame: string) => {
    this.frames.push(frame)
    this._lastFrame = frame
  }

  lastFrame = () => this._lastFrame
}

class TestStdin extends EventEmitter {
  isTTY = true
  data: string | null = null

  write = (data: string) => {
    this.data = data
    this.emit('readable')
    this.emit('data', data)
  }

  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read = () => {
    const { data } = this
    this.data = null
    return data
  }
}

export const renderWithHeight = (tree: ReactNode, terminalRows: number) => {
  const stdout = new TestStdout(terminalRows)
  const stderr = new TestStderr()
  const stdin = new TestStdin()

  const instance = inkRender(tree, {
    stdout: stdout as any,
    stderr: stderr as any,
    stdin: stdin as any,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  })

  return {
    rerender: instance.rerender,
    unmount: instance.unmount,
    cleanup: instance.cleanup,
    stdout,
    stderr,
    stdin,
    frames: stdout.frames,
    lastFrame: stdout.lastFrame,
  }
}
