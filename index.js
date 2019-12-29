const fs = require('fs').promises
const util = require('util')

const { DOT_TEMPLATE_REDACTED_MESSAGE = '<REDACTED>' } = process.env
const { DOT_TEMPLATE_UNREDACTED_ENVS = 'development' } = process.env
const { NODE_ENV } = process.env

const handlers = [] // [{ expression: RegExp, valueMutator: Function, redact: Boolean }]
const regExpSpecialChars = /[\\^$*+?.()|[\]{}]/g
const unedactedEnvs = DOT_TEMPLATE_UNREDACTED_ENVS.replace(/\s*/g, '').split(',')
const currentEnvRedacted = !unedactedEnvs.includes(NODE_ENV)
const keyRaw = Symbol('template with literal values')
const keyRedacted = Symbol('template with mix of literal values and redactions')
// `standardTemplate` is assumed to be set only on the first pass
const standardTemplate = Symbol('skip logic to replace prefixes in templates')
const inspect = Symbol.for('nodejs.util.inspect.custom')

const templatized = (template, values = {}, valueMutator) => {
  const handler = new Function('values', [
    'const tagged = ( ' + Object.keys(values).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...values)'
  ].join('\n'))

  const handlerValues = Object.values(values).map(variable => valueMutator(variable))

  return handler(handlerValues)
}

class Template {
  constructor(template, values) {
    let resultRaw = template
    let resultRedacted = template

    for (let handlerAttributes of handlers) {
      let replacementsMade = false

      // copy ref to initial `resultRaw`
      // since we will use it to determine a `state`
      let resultRawInitial = resultRaw

      if (handlerAttributes.expression === standardTemplate) {
        // forcing assumption that replacements will be made,
        // since we have no insight when skipping this step
        replacementsMade = true
      } else {
        // running template re-finagling on the 'raw' template ahead-of-time,
        // so that we can skip all other logic if this is a no-op
        resultRaw = resultRaw.replace(handlerAttributes.expression, (_, lead, chunk) => `${lead}$${chunk}`)
        replacementsMade = resultRaw !== resultRawInitial
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

      switch (state) {
        // both templates are the same, and replacements are the same (no redactions)
        case 1:
          // skip all `resultRedacted` logic and just set it to be the same at the end
          resultRaw = resultRedacted = templatized(resultRaw, values, handlerAttributes.valueMutator)
          break

        // both templates are the same, but one will be redacted
        case 2:
          // `resultRedacted` must be processed first, since it uses the current version of `resultRaw`
          resultRedacted = templatized(resultRaw, values, variable => DOT_TEMPLATE_REDACTED_MESSAGE)
          resultRaw = templatized(resultRaw, values, handlerAttributes.valueMutator)
          break

        // templates have diverged, but replacements are the same (no redactions)
        case 3:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultRaw = templatized(resultRaw, values, handlerAttributes.valueMutator)
          resultRedacted = resultRedacted.replace(handlerAttributes.expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultRedacted = templatized(resultRedacted, values, handlerAttributes.valueMutator)
          break

        // templates have diverged, and one will be redacted
        case 4:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultRaw = templatized(resultRaw, values, handlerAttributes.valueMutator)
          resultRedacted = resultRedacted.replace(handlerAttributes.expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultRedacted = templatized(resultRedacted, values, variable => DOT_TEMPLATE_REDACTED_MESSAGE)
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

  return async function prepare(values) {
    return new Template(await template, values)
  }
}

module.exports.addHandler = function addHandler({
  expressionPrefix,
  valueMutator = value => value,
  redact = false
}) {
  let expression

  if (expressionPrefix !== standardTemplate) {
    if (typeof expressionPrefix !== 'string' || expressionPrefix.length < 1) {
      throw new TypeError('addHandler requires \'expressionPrefix\' to be a string of at least 1 character')
    }

    expressionPrefix = expressionPrefix.replace(regExpSpecialChars, '\\$&')
    // replacing `!{}`s with `${}`s
    // keep `\{.*\}` greedy,
    // so any nested `!{}`s will be captured as well
    expression = new RegExp(`([^\\\\]|^)${expressionPrefix}(\\{.*?\\})`, 'g')
  } else {
    expression = standardTemplate
  }

  if (typeof valueMutator !== 'function') {
    throw new TypeError('addHandler requires \'valueMutator\' to be a function')
  }

  // force unredacted on specified environments
  redact = currentEnvRedacted ? redact : false

  handlers.push({
    expression, // RegExp used to replace special literals with vanilla `${}` literals
    valueMutator, // function that can be used to manipulate values found in template literals
    redact // if true, will prevent sensitive args from leaking to console
  })
}

// phase 0: replace standard literals
module.exports.addHandler({
  expressionPrefix: standardTemplate
})

// phase 1: replace sensitive literals
module.exports.addHandler({
  expressionPrefix: '!',
  redact: true
})
