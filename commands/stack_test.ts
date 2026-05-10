import { assertEquals } from '@std/assert'
import { runStack } from './stack.ts'
import { captureConsoleLog, withMockGhPrListJson } from '../tests/test_utils.ts'

Deno.test('stack prints tree format for stack + separate branch', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'base', headRefName: 'feat1', baseRefName: 'main' },
    { number: 2, title: 'child', headRefName: 'feat2', baseRefName: 'feat1' },
    { number: 3, title: 'other', headRefName: 'otherfeat1', baseRefName: 'main' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runStack()
    })

    assertEquals(lines, [
      'main',
      '  -> feat1',
      '    -> feat2',
      '',
      'main',
      '  -> otherfeat1',
    ])
  })
})

Deno.test('stack prints nothing when no PRs', async () => {
  await withMockGhPrListJson('[]', async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runStack()
    })

    assertEquals(lines, [])
  })
})

Deno.test('stack prints single PR stack', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'base', headRefName: 'feat1', baseRefName: 'main' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runStack()
    })

    assertEquals(lines, ['main', '  -> feat1'])
  })
})

Deno.test('stack handles two independent stacks', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'stackA base', headRefName: 'a1', baseRefName: 'main' },
    { number: 2, title: 'stackA child', headRefName: 'a2', baseRefName: 'a1' },
    { number: 3, title: 'stackB base', headRefName: 'b1', baseRefName: 'develop' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runStack()
    })

    assertEquals(lines, [
      'main',
      '  -> a1',
      '    -> a2',
      '',
      'develop',
      '  -> b1',
    ])
  })
})

Deno.test('stack handles branching (two children) by printing both children under same parent', async () => {
  const prsJson = JSON.stringify([
    { number: 1, title: 'base', headRefName: 'feat1', baseRefName: 'main' },
    { number: 2, title: 'child1', headRefName: 'feat2', baseRefName: 'feat1' },
    { number: 3, title: 'child2', headRefName: 'feat2b', baseRefName: 'feat1' },
  ])

  await withMockGhPrListJson(prsJson, async () => {
    const { lines } = await captureConsoleLog(async () => {
      await runStack()
    })

    assertEquals(lines, [
      'main',
      '  -> feat1',
      '    -> feat2',
      '    -> feat2b',
    ])
  })
})
