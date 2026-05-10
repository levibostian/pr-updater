import $ from "@david/dax"
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

export const runOrder = async () => {
  const prs = await listPullRequests()

  if (prs.length === 0) {
    console.log("No open PRs authored by @me in current repo.")
    return
  }

  const stacks = buildStacks(prs)

  console.log("")
  console.log("Suggested merge order (base -> head):")
  for (const stack of stacks) {
    for (const pr of stack) {
      console.log(`${pr.baseRefName} -> ${pr.headRefName}`)
    }
  }
}
