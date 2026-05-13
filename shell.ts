import dax from "@david/dax"

let verbose = false

const $ = dax.build$({
  commandBuilder: (builder) => builder.beforeCommandSync((command) =>
    verbose
      ? command.stdout("inheritPiped").stderr("inheritPiped")
      : command.stdout("piped").stderr("piped")),
})

export const setVerbose = (value: boolean) => {
  verbose = value
  $.setPrintCommand(value)
}

export { $ }
