import dotTemplate from '../../src/'
import { readFile } from 'fs/promises'
import path from 'path'

describe('basic usage', () => {
  test('should render expectation', async () => {
    const template = dotTemplate(path.resolve(__dirname, 'template.html'))

    const pendingResult = template({
      title: 'Conjure Labs',
      name: 'Tim'
    })
    const pendingExpectation = readFile(path.resolve(__dirname, 'expectation.html'), 'utf8')
    const [result, expectation] = await Promise.all([pendingResult, pendingExpectation])

    expect(result.toString()).toMatch(expectation)
  })
})
