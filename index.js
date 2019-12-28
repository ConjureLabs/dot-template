const fs = require('fs').promises
const path = require('path')
const util = require('util')

const { DOT_SQL_REDACTED_MESSAGE = '<REDACTED>' } = process.env
const { DOT_SQL_UNREDACTED_ENVS = 'development' } = process.env
const { NODE_ENV } = process.env

const unedactedEnvs = DOT_SQL_UNREDACTED_ENVS.replace(/\s*/g, '').split(',')
const currentEnvRedacted = !unedactedEnvs.includes(NODE_ENV)

const templatized = (template, vars = {}) => {
  const handler = new Function('vars', [
    'const tagged = ( ' + Object.keys(vars).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...Object.values(vars))'
  ].join('\n'))

  return handler(vars)
}

const literalSqlKey = Symbol('sql template with literal values')
const redactedSqlKey = Symbol('sql template with redactions')
const inspect = Symbol.for('nodejs.util.inspect.custom')
class SqlTemplate {
  constructor(template, vars) {
    const withPublicLiterals = templatized(template, vars)

    // replacing `!{}`s with `${}`s
    // keep `\{.*\}` greedy,
    // so any nested `!{}`s will be captured as well
    const reconfiguredTemplate = withPublicLiterals.replace(/([^\\])!(\{.*\})/g, (_, lead, chunk) => `${lead}$${chunk}`)
    
    this[literalSqlKey] = templatized(reconfiguredTemplate, vars)
    this[redactedSqlKey] = !currentEnvRedacted ? this[literalSqlKey] : templatized(reconfiguredTemplate, Object.keys(vars).reduce((redactions, key) => {
      redactions[key] = DOT_SQL_REDACTED_MESSAGE
      return redactions
    }, {}))
  }

  toString() {
    return this[redactedSqlKey]
  }

  [util.inspect.custom](depth, options) {
    return options.stylize(this[redactedSqlKey], 'string')
  }
}

function dotSql(path) {
  const template = fs.readFile(path, 'utf8')

  return async function prepare(vars) {
    return new SqlTemplate((await template), vars)
  }
}

async function main() {
  testSql = dotSql(path.resolve(__dirname, 'test.sql'))

  const result = await testSql({
    id: 123,
    email: 'tim@%',
    limit: 100
  })

  console.log(result)
}
main()
