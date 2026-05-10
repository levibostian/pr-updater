# pr-updater

CLI help update pull requests by printing correct base -> head merge order for open PR stacks.

## Getting Started

- First, make sure you have [the GitHub CLI (`gh`)](https://cli.github.com/) installed and you're logged in (`gh auth login`).

- Next, install pr-updater. 

The easiest way is to use [mise](https://mise.jdx.dev/): `mise use --global github:levibostian/pr-updater`
Otherwise, feel free to download a pre-compiled binary from [the releases page](https://github.com/levibostian/pr-updater/releases).

- Lastly, it's time to run the CLI! From the root of your git repo, run `pr-updater order` to print the suggested merge order for your open PRs. You can also run `pr-updater stack` to print the PR stack in a tree format.