# pr-updater

CLI help update pull requests by printing correct base -> head merge order for open PR stacks.

## Getting Started

### Prereqs

- Install Deno: https://deno.com/
- Install GitHub CLI (`gh`): https://cli.github.com/
  - Then authenticate:
    ```sh
    gh auth login
    ```
- Install Git (needed because you run this inside repo).

### Run

1. `cd` into git repo you want operate on (repo must have open PRs authored by you).
2. Run CLI:
   ```sh
   deno run -A main.ts order
   ```

### Other commands

```sh
deno run -A main.ts stack
```
