export type RunCommandResult = {
  ok: boolean
  code: number
  message?: string
}

export const ok = (): RunCommandResult => ({ ok: true, code: 0 })

export const fail = (message?: string, code = 1): RunCommandResult => ({ ok: false, code, message })
