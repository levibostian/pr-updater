import $ from "@david/dax"

export type PullRequest = {
  number: number
  title: string
  headRefName: string
  baseRefName: string
}

type Stack = PullRequest[]

export const buildStacks = (prs: PullRequest[]): Stack[] => {
  const prByHead = new Map<string, PullRequest>()
  for (const pr of prs) prByHead.set(pr.headRefName, pr)

  const childrenByBase = new Map<string, PullRequest[]>()
  for (const pr of prs) {
    const list = childrenByBase.get(pr.baseRefName) ?? []
    list.push(pr)
    childrenByBase.set(pr.baseRefName, list)
  }

  const roots = prs.filter((pr) => !prByHead.has(pr.baseRefName))
  const stacks: Stack[] = []
  const usedHeads = new Set<string>()

  for (const root of roots) {
    const stack: Stack = []
    let current: PullRequest | undefined = root
    const seen = new Set<string>()

    while (current) {
      if (seen.has(current.headRefName)) break
      seen.add(current.headRefName)
      usedHeads.add(current.headRefName)
      stack.push(current)
      const children: PullRequest[] = childrenByBase.get(current.headRefName) ?? []
      current = children[0]
    }

    stacks.push(stack)
  }

  const unused = prs.filter((pr) => !usedHeads.has(pr.headRefName))
  for (const pr of unused) stacks.push([pr])

  return stacks
}

const formatPr = (pr: PullRequest) => `#${pr.number} ${pr.headRefName} (base: ${pr.baseRefName}) - ${pr.title}`

const listPullRequests = async (): Promise<PullRequest[]> => {
  const { stdout } = await $`gh pr list --state open --author @me --json number,title,headRefName,baseRefName`.stdout("piped")
  return JSON.parse(stdout) as PullRequest[]
}

export const getStacks = async (): Promise<Stack[]> => {
  const prs = await listPullRequests()
  return buildStacks(prs)
}

type StackTreeNode = {
  pr: PullRequest
  children: StackTreeNode[]
}

type StackTree = {
  base: string
  root: StackTreeNode
}

export const buildStackTrees = (prs: PullRequest[]): StackTree[] => {
  const prByHead = new Map<string, PullRequest>()
  for (const pr of prs) prByHead.set(pr.headRefName, pr)

  const childrenByBase = new Map<string, PullRequest[]>()
  for (const pr of prs) {
    const list = childrenByBase.get(pr.baseRefName) ?? []
    list.push(pr)
    childrenByBase.set(pr.baseRefName, list)
  }

  const roots = prs.filter((pr) => !prByHead.has(pr.baseRefName))
  const rootList = roots.length > 0 ? roots : prs

  const buildNode = (pr: PullRequest, path: Set<string>): StackTreeNode => {
    if (path.has(pr.headRefName)) return { pr, children: [] }
    const nextPath = new Set(path)
    nextPath.add(pr.headRefName)

    const children = (childrenByBase.get(pr.headRefName) ?? []).slice()
    children.sort((a, b) => a.headRefName.localeCompare(b.headRefName))

    return {
      pr,
      children: children.map((child) => buildNode(child, nextPath)),
    }
  }

  return rootList.map((root) => ({
    base: root.baseRefName,
    root: buildNode(root, new Set()),
  }))
}

export const runStack = async () => {
  const prs = await listPullRequests()
  if (prs.length === 0) return

  const trees = buildStackTrees(prs)

  const printNode = (node: StackTreeNode, depth: number) => {
    console.log(`${'  '.repeat(depth + 1)}-> ${node.pr.headRefName}`)
    for (const child of node.children) printNode(child, depth + 1)
  }

  for (const [index, tree] of trees.entries()) {
    if (index > 0) console.log('')
    console.log(tree.base)
    printNode(tree.root, 0)
  }
}
