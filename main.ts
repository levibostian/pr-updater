import { parseArgs } from "@std/cli/parse-args"
import { runMerge } from "./commands/merge.ts"
import { runOrder } from "./commands/order.ts"
import { runStack } from "./commands/stack.ts"
import { runUpdate } from "./commands/update.ts"
import { setVerbose } from "./shell.ts"

const usage = `Usage:
  pr-updater order - Suggests a git merge order to update open PRs based on their relationships.
  pr-updater stack - Displays the stacks of open PRs. 
  pr-updater merge --base <branch> --head <branch> [--resolve-cmd <command>]
  pr-updater update [--resolve-cmd <command>] [--merge-arg <arg> ...] [--push]

Options:
  -h, --help     Show help
  -v, --verbose  Enable command logging
`

const parsed = parseArgs(Deno.args, {
  boolean: ["help", "verbose"],
  alias: { h: "help", v: "verbose" },
  stopEarly: true,
})
const [command, ...commandArgs] = parsed._.map(String)

if (parsed.help || !command) {
  console.log(usage)
  Deno.exit(0)
}

const globalVerbose = parsed.verbose ?? false
const applyVerbose = (commandVerbose?: boolean) => setVerbose(commandVerbose ?? globalVerbose)

const exitWithResult = (result: { ok: boolean; code: number; message?: string }) => {
  if (!result.ok && result.message) console.log(result.message)
  Deno.exit(result.code)
}

switch (command) {
  case "order": {
    const orderParsed = parseArgs(commandArgs, { boolean: ["verbose"], alias: { v: "verbose" } })
    applyVerbose(orderParsed.verbose)
    await runOrder()
    break
  }
  case "stack": {
    const stackParsed = parseArgs(commandArgs, { boolean: ["verbose"], alias: { v: "verbose" } })
    applyVerbose(stackParsed.verbose)
    await runStack()
    break
  }
  case "merge": {
    const mergeParsed = parseArgs(commandArgs, {
      string: ["base", "head", "resolve-cmd", "merge-arg"],
      boolean: ["verbose"],
      collect: ["merge-arg"],
      alias: { v: "verbose" },
    })

    applyVerbose(mergeParsed.verbose)

    if (!mergeParsed.base || !mergeParsed.head) {
      console.log("Missing required args: --base and --head.")
      Deno.exit(1)
    }

    const mergeResult = await runMerge({
      base: mergeParsed.base,
      head: mergeParsed.head,
      resolveCmd: mergeParsed["resolve-cmd"],
      mergeArgs: mergeParsed["merge-arg"] ?? [],
    })

    exitWithResult(mergeResult)
  }
  case "update": {
    const updateParsed = parseArgs(commandArgs, {
      string: ["resolve-cmd", "merge-arg"],
      boolean: ["push", "verbose"],
      collect: ["merge-arg"],
      default: { push: false },
      alias: { v: "verbose" },
    })

    applyVerbose(updateParsed.verbose)

    const updateResult = await runUpdate({
      resolveCmd: updateParsed["resolve-cmd"],
      mergeArgs: updateParsed["merge-arg"] ?? [],
      push: updateParsed.push,
    })

    exitWithResult(updateResult)
  }
  default:
    console.log(`Unknown command: ${command}`)
    console.log(usage)
    Deno.exit(1)
}
