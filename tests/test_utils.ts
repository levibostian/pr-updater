import { mockBin, type MockBinCleanup } from '@levibostian/mock-a-bin'

// mockBin mutates PATH (global process state). Keep tests serial.
let exclusive: Promise<void> = Promise.resolve()

export const withExclusive = async <T>(fn: () => Promise<T>): Promise<T> => {
  const previous = exclusive
  let release!: () => void
  exclusive = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

export const withMockGhPrListJson = async <T>(prsJson: string, fn: () => Promise<T>): Promise<T> => {
  return await withExclusive(async () => {
    const script = `
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  echo '${prsJson}'
else
  echo "unexpected gh call: $@" 1>&2
  exit 1
fi
`
    const cleanup: MockBinCleanup = await mockBin('gh', 'bash', script)

    try {
      return await fn()
    } finally {
      cleanup()
    }
  })
}

export const captureConsoleLog = async <T>(fn: () => Promise<T>) => {
  const lines: string[] = []
  const original = console.log

  console.log = ((...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '))
  }) as typeof console.log

  try {
    const result = await fn()
    return { lines, result }
  } finally {
    console.log = original
  }
}
