const fs = require('fs').promises
const util = require('util')

const allExpressionPrefixes = ['\\$']
const handlers = [] // [{ expression: RegExp, valueMutator?: Function, logMutator?: Function }]
const regExpSpecialChars = /[\\^$*+?.()|[\]{}]/g
const keyApplied = Symbol('template with applied values')
const keyLogged = Symbol('template with mix of applied values and custom logger replacements')
// `standardTemplate` is assumed to be set only on the first pass
const standardTemplate = Symbol('skip logic to replace prefixes in templates')
const inspect = Symbol.for('nodejs.util.inspect.custom')

const selfReturnNoOp = arg => arg

const templatized = (template, values = {}, mutator, ...tailingArgs) => {
  const handler = new Function('values', [
    'const tagged = ( ' + Object.keys(values).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...values)'
  ].join('\n'))

  const handlerValues = Object.values(values).map(variable => mutator(variable, values, ...tailingArgs))

  return handler(handlerValues)
}

const uniquePrefix = '____generated_'
function appendUniqueValueKey(values, newValue, keyIndex = 0) {
  while (values.hasOwnProperty(`${uniquePrefix}${keyIndex}`)) {
    keyIndex++
  }

  const newKey = `${uniquePrefix}${keyIndex}`
  values[newKey] = newValue
  return [
    newKey,
    keyIndex + 1
  ]
}

class Template {
  constructor(template, valuesInput, ...tailingArgs) {
    const values = { ...valuesInput }

    // before handling typical template replacements,
    // first going to check for embedded templates
    // ---
    // matching @key(embeddedTemplate)
    // `key` should pair to an array, within `values`
    // each cell of `key` will be used to render the subtemplate
    // ---
    // joined, by default, with `, `
    // a custome join token can be set via:
    // @key(embeddedTemplate)&(joinToken)
    let subtemplateIndexIncrement = 0
    let allExpressionsMatcher

    // this regexp matches something like:
    //   @key(${thing1} is ${thing2})
    // or
    //   @key(${thing1} is ${thing2})&(, )
    //
    //   ([^\\]|^)                start, as long as not an escaped \@
    //   @(\w+)                   @key
    //   \((                      start of (<content>) matching
    //     (?:                    start of (non-remembered) patterns
    //       (?:\(.*\))           matching parenthetical contents, like (something)
    //       |                    or
    //       [^)]                 non-terminating characters
    //     )*?                    end of (non-remembered) patterns, with non-greedy matching
    //   )\)                      end of (<content>) matching
    //   \((.*)\)                 contents within parenthesis - where only the contents inside are remembered
    //   (?:&\(([^)]*)\))?        matches something like &(, ) - which may or may not tail the previous
    //                            remembers only the content within the parenthesis
    template = template.replace(/([^\\]|^)@(\w+)\(((?:(?:\(.*\))|[^)])*?)\)(?:&\(([^)]*)\))?/g, (_, lead, key, subtemplate, join = ', ') => {
      if (!values.hasOwnProperty(key)) {
        return lead
      }

      if (!Array.isArray(values[key])) {
        throw new Error(`Expected values.${key} to be an array`)
      }

      allExpressionsMatcher = allExpressionsMatcher || new RegExp(`([^\\\\]|^)(${allExpressionPrefixes.join('|')})\\{(.*?)\\}`, 'g')

      return lead + values[key].map((subValues, index) => {
        return subtemplate.replace(allExpressionsMatcher, (_, lead, expressionPrefix, valueKey) => {
          const [newKey, newIncrementIndex] = appendUniqueValueKey(values, subValues[valueKey], subtemplateIndexIncrement)
          subtemplateIndexIncrement = newIncrementIndex
          return `${lead}${expressionPrefix}{${newKey}}`
        })
      }).join(join)
    })

    let resultApplied = template
    let resultLogged = template

    for (let handlerAttributes of handlers) {
      const { expression, valueMutator, valuesObjectMutator, logMutator } = handlerAttributes

      let replacementsMade = false

      // copy ref to initial `resultApplied`
      // since we will use it to determine a `state`
      let resultAppliedInitial = resultApplied

      if (expression === standardTemplate) {
        // forcing assumption that replacements will be made,
        // since we have no insight when skipping this step
        replacementsMade = true
      } else {
        // running template re-finagling on the 'raw' template ahead-of-time,
        // so that we can skip all other logic if this is a no-op
        resultApplied = resultApplied.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
        replacementsMade = resultApplied !== resultAppliedInitial
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
        resultAppliedInitial === resultLogged && mutatorsAreSame ? 1 :
        resultAppliedInitial === resultLogged ? 2 :
        mutatorsAreSame ? 3 :
        4

      switch (state) {
        // both templates are the same, and replacements are the same
        case 1:
        // both templates are the same, but replacements differ (between literal string & console logs)
        case 2:
          // `resultLogged` must be processed first, since it uses the current version of `resultApplied`
          resultLogged = templatized(resultApplied, valuesObjectMutator(values, 'logged', ...tailingArgs), logMutator, ...tailingArgs)
          resultApplied = templatized(resultApplied, valuesObjectMutator(values, 'applied', ...tailingArgs), valueMutator, ...tailingArgs)
          break

        // templates have diverged, but replacements are the same
        case 3:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultApplied = templatized(resultApplied, valuesObjectMutator(values, 'applied', ...tailingArgs), valueMutator, ...tailingArgs)
          resultLogged = resultLogged.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultLogged = templatized(resultLogged, valuesObjectMutator(values, 'logged', ...tailingArgs), valueMutator, ...tailingArgs)
          break

        // templates have diverged, and replacements differ (between literal string & console logs)
        case 4:
          // not checking against `skipReplacements` since that should
          // only be set on the first pass, which will result in state of `1`
          resultApplied = templatized(resultApplied, valuesObjectMutator(values, 'applied', ...tailingArgs), valueMutator, ...tailingArgs)
          resultLogged = resultLogged.replace(expression, (_, lead, chunk) => `${lead}$${chunk}`)
          resultLogged = templatized(resultLogged, valuesObjectMutator(values, 'logged', ...tailingArgs), logMutator, ...tailingArgs)
          break
      }
    }

    this[keyApplied] = resultApplied
    this[keyLogged] = resultLogged
  }

  toString() {
    return this[keyApplied]
  }

  get sanitized() {
    return this[keyLogged]
  }

  [util.inspect.custom](depth, options) {
    return options.stylize(this[keyLogged], 'string')
  }
}

module.exports = function dotTemplate(path) {
  const template = fs.readFile(path, 'utf8')

  return async function prepare(values, ...tailingArgs) {
    return new Template(await template, values, null, ...tailingArgs)
  }
}

module.exports.addHandler = function addHandler({
  expressionPrefix,
  valueMutator = selfReturnNoOp,
  valuesObjectMutator = selfReturnNoOp,
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
    expression = new RegExp(`([^\\\\]|^)${expressionPrefix}(\\{.*?\\})`, 'g')

    allExpressionPrefixes.push(expressionPrefix)
  } else {
    expression = standardTemplate
  }

  if (typeof valueMutator !== 'function') {
    throw new TypeError('addHandler requires \'valueMutator\' to be a function')
  }

  if (typeof valuesObjectMutator !== 'function') {
    throw new TypeError('addHandler requires \'valuesObjectMutator\' to be a function')
  }

  if (typeof logMutator !== 'function') {
    throw new TypeError('addHandler requires \'logMutator\' to be a function')
  }

  handlers.push({
    expression, // RegExp used to replace special values with vanilla `${}` values
    valueMutator, // function that can be used to manipulate template values
    valuesObjectMutator, // function that can be used to override what values object is used for replacements
    logMutator // function that can be used to manipulate how values are printed to console
  })
}

// phase 0: replace standard applied values (e.g. `${}`)
module.exports.addHandler({
  expressionPrefix: standardTemplate
})
