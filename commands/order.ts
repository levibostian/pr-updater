import { $ } from "../shell.ts"
import { buildStacks } from "./stack.ts"

export type PullRequest = {
  number: number
  title: string
  headRefName: string
  baseRefName: string
}

const listPullRequests = async (): Promise<PullRequest[]> => {
  const { stdout } = await $`gh pr list --state open --author @me --json number,title,headRefName,baseRefName`.stdout("piped")
  return JSON.parse(stdout) as PullRequest[]
}

export type MergeOrder = {
  base: string
  head: string
}

export const getMergeOrder = async (): Promise<MergeOrder[]> => {
  const prs = await listPullRequests()
  const stacks = buildStacks(prs)

  const order: MergeOrder[] = []
  for (const stack of stacks) {
    for (const pr of stack) {
      order.push({ base: pr.baseRefName, head: pr.headRefName })
    }
  }

  return order
}

export const runOrder = async () => {
  const order = await getMergeOrder()

  if (order.length === 0) {
    console.log("No open PRs authored by @me in current repo.")
    return
  }

  console.log("")
  console.log("Suggested merge order (base -> head):")
  for (const item of order) {
    console.log(`${item.base} -> ${item.head}`)
  }
}
