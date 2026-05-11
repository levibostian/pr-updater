# pr-updater

CLI help update pull requests by printing correct base -> head merge order for open PR stacks.

## Getting Started

- First, make sure you have [the GitHub CLI (`gh`)](https://cli.github.com/) installed and you're logged in (`gh auth login`).

- Next, install pr-updater. 

The easiest way is to use [mise](https://mise.jdx.dev/): `mise use --global github:levibostian/pr-updater`
Otherwise, feel free to download a pre-compiled binary from [the releases page](https://github.com/levibostian/pr-updater/releases).

- Lastly, it's time to run it. Here’s the list of commands to choose from.

| Command | Description | Example |
| --- | --- | --- |
| `order` | Suggests a git merge order to update open PRs based on their relationships. | `pr-updater order` |
| `stack` | Displays the stacks of open PRs. | `pr-updater stack` |
| `merge` | Merges one branch into another and optionally auto-resolves conflicts. | `pr-updater merge --base main --head feature/one --resolve-cmd "resolve-merge-conflicts" --merge-arg --no-ff` |
| `update` | Runs `order` then merges each suggested pair, optionally pushing results. | `pr-updater update --resolve-cmd "resolve-merge-conflicts" --merge-arg --no-ff --push` |