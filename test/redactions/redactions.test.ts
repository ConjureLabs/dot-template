import dotTemplate from '../../src/'
import { readFile } from 'fs/promises'
import path from 'path'

describe('basic usage', () => {
  test('value mutator should work as expected', async () => {
    dotTemplate.addHandler({
      expressionPrefix: '!',
      valueMutator: () => '>>REDACTED<<'
    })
    const template = dotTemplate(path.resolve(__dirname, 'template.sql'))

    const pendingResult = template({
      pii: 'Tim Marshall',
      randomNumber: 1024
    })
    const pendingMutatedExpectation = readFile(path.resolve(__dirname, 'mutated-expectation.sql'), 'utf8')
    const [result, mutatedExpectation] = await Promise.all([pendingResult, pendingMutatedExpectation])

    expect(result.toString()).toMatch(mutatedExpectation)
  })
})
