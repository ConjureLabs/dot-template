const fs = require('fs').promises
const util = require('util')

const handlers = [] // [{ expression: RegExp, valueMutator?: Function, logMutator?: Function }]
const regExpSpecialChars = /[\\^$*+?.()|[\]{}]/g
const keyLiteral = Symbol('template with literal values')
const keyLogged = Symbol('template with mix of literal values and custom logger replacements')
// `standardTemplate` is assumed to be set only on the first pass
const standardTemplate = Symbol('skip logic to replace prefixes in templates')
const inspect = Symbol.for('nodejs.util.inspect.custom')

const valueNoOp = value => value

const templatized = (template, values = {}, mutator, ...tailingArgs) => {
  const handler = new Function('values', [
    'const tagged = ( ' + Object.keys(values).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...values)'
  ].join('\n'))

  const handlerValues = Object.values(values).map(variable => mutator(variable, values, ...tailingArgs))

  return handler(handlerValues)
}

class Template {
  constructor(template, values, ...tailingArgs) {
    let resultLiteral = template
    let resultLogged = template

    for (let handlerAttributes of handlers) {
      const { expression, valueMutator, logMutator } = handlerAttributes

      let replacementsMade = false

      // copy ref to initial `resultLiteral`
      // since we will use it to determine a `state`
      let resultLiteralInitial = resultLiteral

      if (expression === standardTemplate) {
        // forcing assumption that replacements will be made,
        // since we have no insight when skipping this step
        replacementsMade = true
      } else {
        // running template re-finagling on the 'raw' template ahead-of-time,
        // so that we can skip all other logic if this is a no-op
        resultLiteral = resultLiteral.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
        replacementsMade = resultLiteral !== resultLiteralInitial
      }

      if (replacementsMade === false) {
        continue
      }

      // at this point there are four possible states:
      // 1. both templates are the same, and replacements are the same
      // 2. both templates are the same, but replacements differ (between literal string & console logs)
      // 3. templates have diverged, but replacements are the same
      // 4. templates have diverged, and replacements differ (between literal string & console logs)
      const mutatorsAreSame = valueMutator === logMutator
      const state =
        resultLiteralInitial === resultLogged && mutatorsAreSame ? 1 :
        resultLiteralInitial === resultLogged ? 2 :
        mutatorsAreSame ? 3 :
        4

      switch (state) {
        // both templates are the same, and replacements are the same
        case 1:
          // skip all `resultLogged` logic and just set it to be the same at the end
          resultLiteral = resultLogged = templatized(resultLiteral, values, valueMutator, ...tailingArgs)
          break

        // both templates are the same, but replacements differ (between literal string & console logs)
        case 2:
          // `resultLogged` must be processed first, since it uses the current version of `resultLiteral`
          resultLogged = templatized(resultLiteral, values, logMutator, ...tailingArgs)
          resultLiteral = templatized(resultLiteral, values, valueMutator, ...tailingArgs)
          break

        // templates have diverged, but replacements are the same
        case 3:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultLiteral = templatized(resultLiteral, values, valueMutator, ...tailingArgs)
          resultLogged = resultLogged.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultLogged = templatized(resultLogged, values, valueMutator, ...tailingArgs)
          break

        // templates have diverged, and replacements differ (between literal string & console logs)
        case 4:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultLiteral = templatized(resultLiteral, values, valueMutator, ...tailingArgs)
          resultLogged = resultLogged.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultLogged = templatized(resultLogged, values, logMutator, ...tailingArgs)
          break
      }
    }

    this[keyLiteral] = resultLiteral
    this[keyLogged] = resultLogged
  }

  toString() {
    return this[keyLiteral]
  }

  [util.inspect.custom](depth, options) {
    return options.stylize(this[keyLogged], 'string')
  }
}

module.exports = function dotTemplate(path) {
  const template = fs.readFile(path, 'utf8')

  return async function prepare(values, ...tailingArgs) {
    return new Template(await template, values, ...tailingArgs)
  }
}

module.exports.addHandler = function addHandler({
  expressionPrefix,
  valueMutator = valueNoOp,
  logMutator
}) {
  let expression

  if (logMutator === undefined) {
    logMutator = valueMutator
  }

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

  if (typeof logMutator !== 'function') {
    throw new TypeError('addHandler requires \'logMutator\' to be a function')
  }

  handlers.push({
    expression, // RegExp used to replace special literals with vanilla `${}` literals
    valueMutator, // function that can be used to manipulate values found in template literals
    logMutator // function that can be used to manipulate how values are printed to console
  })
}

// phase 0: replace standard literals
module.exports.addHandler({
  expressionPrefix: standardTemplate
})
