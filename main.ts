import { parseArgs } from "@std/cli/parse-args"
import { runMerge } from "./commands/merge.ts"
import { runOrder } from "./commands/order.ts"
import { runStack } from "./commands/stack.ts"

const usage = `Usage:
  pr-updater order - Suggests a git merge order to update open PRs based on their relationships.
  pr-updater stack - Displays the stacks of open PRs. 
  pr-updater merge --base <branch> --head <branch> [--resolve-cmd <command>]

Options:
  -h, --help  Show help
`

const parsed = parseArgs(Deno.args, { boolean: ["help"], alias: { h: "help" }, stopEarly: true })
const [command, ...commandArgs] = parsed._.map(String)

if (parsed.help || !command) {
  console.log(usage)
  Deno.exit(0)
}

switch (command) {
  case "order": {
    await runOrder()
    break
  }
  case "stack": {    
    await runStack()
    break
  }
  case "merge": {
    const mergeParsed = parseArgs(commandArgs, {
      string: ["base", "head", "resolve-cmd", "merge-arg"],
      collect: ["merge-arg"],
    })

    await runMerge({
      base: mergeParsed.base,
      head: mergeParsed.head,
      resolveCmd: mergeParsed["resolve-cmd"],
      mergeArgs: mergeParsed["merge-arg"] ?? [],
    })
    break
  }
  default:
    console.log(`Unknown command: ${command}`)
    console.log(usage)
    Deno.exit(1)
}
