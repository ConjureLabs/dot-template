const fs = require('fs').promises
const path = require('path')
const util = require('util')

const { DOT_TEMPLATE_REDACTED_MESSAGE = '<REDACTED>' } = process.env
const { DOT_TEMPLATE_UNREDACTED_ENVS = 'development' } = process.env
const { NODE_ENV } = process.env

const unedactedEnvs = DOT_TEMPLATE_UNREDACTED_ENVS.replace(/\s*/g, '').split(',')
const currentEnvRedacted = !unedactedEnvs.includes(NODE_ENV)
const literalKey = Symbol('template with literal values')
const redactedKey = Symbol('template with redactions')
const inspect = Symbol.for('nodejs.util.inspect.custom')

const templatized = (template, vars = {}) => {
  const handler = new Function('vars', [
    'const tagged = ( ' + Object.keys(vars).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...Object.values(vars))'
  ].join('\n'))

  return handler(vars)
}

class Template {
  constructor(template, vars) {
    const withPublicLiterals = templatized(template, vars)

    // replacing `!{}`s with `${}`s
    // keep `\{.*\}` greedy,
    // so any nested `!{}`s will be captured as well
    const reconfiguredTemplate = withPublicLiterals.replace(/([^\\]|^)!(\{.*\})/g, (_, lead, chunk) => `${lead}$${chunk}`)
    
    this[literalKey] = templatized(reconfiguredTemplate, vars)
    this[redactedKey] = !currentEnvRedacted ? this[literalKey] : templatized(reconfiguredTemplate, Object.keys(vars).reduce((redactions, key) => {
      redactions[key] = DOT_TEMPLATE_REDACTED_MESSAGE
      return redactions
    }, {}))
  }

  toString() {
    return this[literalKey]
  }

  [util.inspect.custom](depth, options) {
    return options.stylize(this[redactedKey], 'string')
  }
}

module.exports = function dotTemplate(path) {
  const template = fs.readFile(path, 'utf8')

  return async function prepare(vars) {
    return new Template(await template, vars)
  }
}
