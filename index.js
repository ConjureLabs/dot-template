const fs = require('fs').promises
const util = require('util')

const { DOT_TEMPLATE_REDACTED_MESSAGE = '<REDACTED>' } = process.env
const { DOT_TEMPLATE_UNREDACTED_ENVS = 'development' } = process.env
const { NODE_ENV } = process.env

const handlers = [] // [{ expression: RegExp, value: Function, redact: Boolean }]
const regExpSpecialChars = /[\\^$*+?.()|[\]{}]/g
const unedactedEnvs = DOT_TEMPLATE_UNREDACTED_ENVS.replace(/\s*/g, '').split(',')
const currentEnvRedacted = !unedactedEnvs.includes(NODE_ENV)
const keyRaw = Symbol('template with literal values')
const keyRedacted = Symbol('template with mix of literal values and redactions')
const skipExpressionPrefix = Symbol('skip expression prefix logic for handler')
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
    let resultRaw = template
    let resultRedacted = template
    let varsRedacted

    for (let handlerAttributes of handlers) {
      let skipReplacements = handlerAttributes.expressionPrefix === skipExpressionPrefix
      let replacementsMade = false

      // copy ref to initial `resultRaw`
      // since we will use it to determine a `state`
      let resultRawInitial = resultRaw

      if (skipReplacements) {
        // forcing assumption that replacements will be made,
        // since we have no insight when skipping this step
        replacementsMade = true
      } else {
        // running template re-finagling on the 'raw' template ahead-of-time,
        // so that we can skip all other logic if this is a no-op
        resultRaw = resultRaw.replace(handlerAttributes.expression, (_, lead, chunk) => {
          replacementsMade = true
          return `${lead}$${chunk}`
        })
      }

      if (replacementsMade === false) {
        continue
      }

      // at this point there are four possible states:
      // 1. both templates are the same, and replacements are the same (no redactions)
      // 2. both templates are the same, but one will be redacted
      // 3. templates have diverged, but replacements are the same (no redactions)
      // 4. templates have diverged, and one will be redacted
      const state =
        resultRawInitial === resultRedacted && handlerAttributes.redact === false ? 1 :
        resultRawInitial === resultRedacted ? 2 :
        handlerAttributes.redact === false ? 3 :
        4

      if ((state === 2 || state === 4) && varsRedacted === undefined) {
        varsRedacted = Object.keys(vars).reduce((redactions, key) => {
          redactions[key] = DOT_TEMPLATE_REDACTED_MESSAGE
          return redactions
        }, {})
      }

      switch (state) {
        // both templates are the same, and replacements are the same (no redactions)
        case 1:
          // skip all `resultRedacted` logic and just set it to be the same at the end
          resultRaw = resultRedacted = templatized(resultRaw, vars)
          break

        // both templates are the same, but one will be redacted
        case 2:
          resultRaw = templatized(resultRaw, vars)
          resultRedacted = templatized(resultRaw, varsRedacted)
          break

        // templates have diverged, but replacements are the same (no redactions)
        case 3:
          resultRaw = templatized(resultRaw, vars)
          // technically `skipReplacements` should only be true on
          // the first pass, in which case this state is unreachable,
          // so this check is unnecessary,
          // but it's kept in for consistency
          if (!skipReplacements) {
            resultRedacted = resultRedacted.replace(handlerAttributes.expression, (_, lead, chunk) => `${lead}$${chunk}`)
          }
          resultRedacted = templatized(resultRedacted, vars)
          break

        // templates have diverged, and one will be redacted
        case 4:
          resultRaw = templatized(resultRaw, vars)
          // technically `skipReplacements` should only be true on
          // the first pass, in which case this state is unreachable,
          // so this check is unnecessary,
          // but it's kept in for consistency
          if (!skipReplacements) {
            resultRedacted = resultRedacted.replace(handlerAttributes.expression, (_, lead, chunk) => `${lead}$${chunk}`)
          }
          resultRedacted = templatized(resultRedacted, varsRedacted)
          break
      }
    }

    this[keyRaw] = resultRaw
    this[keyRedacted] = resultRedacted
  }

  toString() {
    return this[keyRaw]
  }

  [util.inspect.custom](depth, options) {
    return options.stylize(this[keyRedacted], 'string')
  }
}

module.exports = function dotTemplate(path) {
  const template = fs.readFile(path, 'utf8')

  return async function prepare(vars) {
    return new Template(await template, vars)
  }
}

module.exports.addHandler = function addHandler({
  expressionPrefix,
  value = valueArg => valueArg,
  redact: false
}) => {
  let expression

  if (expressionPrefix !== skipExpressionPrefix) {
    if (typeof expressionPrefix !== 'string' || expressionPrefix.length < 1) {
      throw new TypeError('addHandler requires \'expressionPrefix\' to be a string of at least 1 character')
    }

    expressionPrefix = expressionPrefix.replace(regExpSpecialChars, '\\$&')
    // replacing `!{}`s with `${}`s
    // keep `\{.*\}` greedy,
    // so any nested `!{}`s will be captured as well
    expression = new RegExp(`([^\\\\]|^)${expressionPrefix}(\\{.*\\})`, 'g')
  } else {
    expression = skipExpressionPrefix
  }

  if (typeof value !== 'function') {
    throw new TypeError('addHandler requires \'value\' to be a function')
  }

  // force unredacted on specified environments
  redact = currentEnvRedacted ? redact : false

  handlers.push({
    expression, // RegExp used to replace special literals with vanilla `${}` literals
    value, // function that can be used to manipulate values found in template literals
    redact // if true, will prevent sensitive args from leaking to console
  })
}

// phase 0: replace standard literals
addHandler({
  expressionPrefix: skipExpressionPrefix
})

// phase 1: replace sensitive literals
addHandler({
  expressionPrefix: '!',
  redact: true
})
