import { type ChildProcess, spawn } from 'node:child_process'

export type ProcessOptions = {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export type ProcessResult = {
  code: number | null
  stdout: string
  stderr: string
  error: Error | null
  timedOut: boolean
  durationMs: number
}

export const runProcess = ({ command, args, cwd, env, timeoutMs }: ProcessOptions) =>
  new Promise<ProcessResult>((resolve) => {
    const started = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (code: number | null, error: Error | null) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, error, timedOut, durationMs: Date.now() - started })
    }
    let child: ChildProcess
    try {
      child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (e) {
      done(null, e instanceof Error ? e : new Error(String(e)))
      return
    }
    if (timeoutMs)
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', (e) => done(null, e))
    child.on('close', (code) => done(code, null))
  })
