import { $ } from "../shell.ts"
import { getMergeOrder } from "./order.ts"
import { runMerge } from "./merge.ts"
import { fail, ok, type RunCommandResult } from "./run_command_result.ts"

export type UpdateOptions = {
  resolveCmd?: string
  mergeArgs: string[]
  push: boolean
}

export const runUpdate = async (options: UpdateOptions): Promise<RunCommandResult> => {
  const order = await getMergeOrder()

  if (order.length === 0) {
    console.log("No open PRs authored by @me in current repo.")
    return ok()
  }

  console.log("")
  console.log("Suggested merge order (base -> head):")
  for (const item of order) {
    console.log(`${item.base} -> ${item.head}`)
  }

  for (const item of order) {
    const mergeResult = await runMerge({
      base: item.base,
      head: item.head,
      resolveCmd: options.resolveCmd,
      mergeArgs: options.mergeArgs,
    })

    if (!mergeResult.ok) {
      return { ...mergeResult, message: mergeResult.message ?? `Merge failed for ${item.base} -> ${item.head}.` }
    }

    if (options.push) {
      const push = await $`git push origin ${item.base}`.noThrow()
      if (push.code !== 0) return fail(`git push origin ${item.base} failed.`)
    }
  }

  return ok()
}
