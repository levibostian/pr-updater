import $ from "@david/dax"

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

export const runMerge = async (options: MergeOptions) => {
  const { base, head, resolveCmd, mergeArgs } = options

  if (!base || !head) {
    console.log("Missing required args: --base and --head.")
    Deno.exit(1)
  }

  const checkout = await $`git checkout ${base}`.noThrow()
  if (checkout.code !== 0) Deno.exit(1)

  const merge = await $`git merge ${mergeArgs} ${head}`.noThrow()
  const conflictsAfterMerge = await hasConflicts()

  if (!conflictsAfterMerge && merge.code !== 0) Deno.exit(1)

  if (conflictsAfterMerge) {
    if (!resolveCmd) Deno.exit(1)

    const resolveCode = await $`bash -c ${resolveCmd}`.noThrow()
    if (resolveCode.code !== 0) Deno.exit(1)

    const add = await $`git add -A`.noThrow()
    if (add.code !== 0) Deno.exit(1)
  }

  if (await hasConflicts()) Deno.exit(1)

  if (await isMergeInProgress()) {
    const commit = await $`git commit --no-edit`.noThrow()
    if (commit.code !== 0) Deno.exit(1)
  }

  Deno.exit(0)
}
