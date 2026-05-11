import $ from "@david/dax"
import { fail, ok, type RunCommandResult } from "./run_command_result.ts"

type MergeOptions = {
  base: string
  head: string
  resolveCmd?: string
  mergeArgs: string[]
}

const hasConflicts = async () => {
  const { stdout } = await $`git diff --name-only --diff-filter=U`.stdout("piped")
  return stdout.trim().length > 0
}

const isMergeInProgress = async () => {
  const result = await $`git rev-parse -q --verify MERGE_HEAD`.noThrow()
  return result.code === 0
}

export const runMerge = async (options: MergeOptions): Promise<RunCommandResult> => {
  const { base, head, resolveCmd, mergeArgs } = options

  const checkout = await $`git checkout ${base}`.noThrow()
  if (checkout.code !== 0) return fail()

  const merge = await $`git merge ${mergeArgs} ${head}`.noThrow()
  const conflictsAfterMerge = await hasConflicts()

  if (!conflictsAfterMerge && merge.code !== 0) return fail()

  if (conflictsAfterMerge) {
    if (!resolveCmd) return fail("Merge conflicts detected. Provide --resolve-cmd to continue.")

    const resolveCode = await $`bash -c ${resolveCmd}`.stdout("inherit").stderr("inherit").noThrow()
    if (resolveCode.code !== 0) return fail("Resolve command failed.")

    const add = await $`git add -A`.noThrow()
    if (add.code !== 0) return fail("git add -A failed.")
  }

  if (await hasConflicts()) return fail("Merge conflicts remain after resolution.")

  if (await isMergeInProgress()) {
    const commit = await $`git commit --no-edit`.noThrow()
    if (commit.code !== 0) return fail("Merge commit failed.")
  }

  return ok()
}
