import { assertEquals } from '@std/assert'
import { runOrder } from './order.ts'
import { captureConsoleLog, withMockGhPrListJson } from '../tests/test_utils.ts'

Deno.test('order prints merge order base -> head (stack + separate branch)', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'base', headRefName: 'feat1', baseRefName: 'main' },
    { number: 2, title: 'child', headRefName: 'feat2', baseRefName: 'feat1' },
    { number: 3, title: 'other', headRefName: 'otherfeat1', baseRefName: 'main' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runOrder()
    })

    assertEquals(lines, [
      '',
      'Suggested merge order (base -> head):',
      'main -> feat1',
      'feat1 -> feat2',
      'main -> otherfeat1',
    ])
  })
})

Deno.test('order prints message when no PRs', async () => {
  await withMockGhPrListJson('[]', async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runOrder()
    })

    assertEquals(lines, ['No open PRs authored by @me in current repo.'])
  })
})

Deno.test('order handles two independent stacks', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'stackA base', headRefName: 'a1', baseRefName: 'main' },
    { number: 2, title: 'stackA child', headRefName: 'a2', baseRefName: 'a1' },
    { number: 3, title: 'stackB base', headRefName: 'b1', baseRefName: 'develop' },
    { number: 4, title: 'stackB child', headRefName: 'b2', baseRefName: 'b1' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runOrder()
    })

    assertEquals(lines, [
      '',
      'Suggested merge order (base -> head):',
      'main -> a1',
      'a1 -> a2',
      'develop -> b1',
      'b1 -> b2',
    ])
  })
})

Deno.test('order handles branching (two children) by putting extra child as its own stack', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'base', headRefName: 'feat1', baseRefName: 'main' },
    { number: 2, title: 'child1', headRefName: 'feat2', baseRefName: 'feat1' },
    { number: 3, title: 'child2', headRefName: 'feat2b', baseRefName: 'feat1' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runOrder()
    })

    // current behavior: follow first child only (feat2), then unused (feat2b) becomes standalone
    assertEquals(lines, [
      '',
      'Suggested merge order (base -> head):',
      'main -> feat1',
      'feat1 -> feat2',
      'feat1 -> feat2b',
    ])
  })
})

Deno.test('order does not infinite-loop on cycle', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'cycle1', headRefName: 'c1', baseRefName: 'c2' },
    { number: 2, title: 'cycle2', headRefName: 'c2', baseRefName: 'c1' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runOrder()
    })

    // roots empty -> stacks built as [ [c1], [c2] ] (unused path)
    assertEquals(lines, [
      '',
      'Suggested merge order (base -> head):',
      'c2 -> c1',
      'c1 -> c2',
    ])
  })
})
