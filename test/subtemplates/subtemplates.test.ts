import dotTemplate from '../../src/'
import { readFile } from 'fs/promises'
import path from 'path'

describe('subtemplates', () => {
  test('should render expectation', async () => {
    const template = dotTemplate(path.resolve(__dirname, 'template.html'))

    const pendingResult = template({
      title: 'Conjure Labs',
      divs: [{
        content: 'Tim'
      }, {
        content: 'Marshall'
      }]
    })
    const pendingExpectation = readFile(path.resolve(__dirname, 'expectation.html'), 'utf8')
    const [result, expectation] = await Promise.all([pendingResult, pendingExpectation])

    expect(result.toString()).toMatch(expectation)
  })
})
