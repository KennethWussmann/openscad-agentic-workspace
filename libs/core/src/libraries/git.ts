import { runProcess } from '../process/run.ts'

export const git = async (args: string[], cwd: string) => {
  const run = await runProcess({ command: 'git', args, cwd })
  if (run.error) throw new Error(`git is required for OpenSCAD libraries: ${run.error.message}`)
  if (run.code !== 0) throw new Error(`git ${args[0]} failed: ${run.stderr.trim() || `exit ${run.code}`}`)
  return run.stdout.trim()
}

export const gitVersion = async () => {
  const run = await runProcess({ command: 'git', args: ['--version'] })
  return run.code === 0 ? run.stdout.trim() : null
}
