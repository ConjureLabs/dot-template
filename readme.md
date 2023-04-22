# dot-template

`dot-template` allows you to save templatized flatfiles, with added niceties

this library uses built-in [javascript template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

## install

```
npm install @conjurelabs/dot-template
```

## use

say you have the following file:

_index.html_
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <div>Hello ${name}</div>
  </body>
</html>
```

you can then use `dot-template` to pull up the file and pass arguments

```js
import dotTemplate from '@conjurelabs/dot-template'

async function main() {
  const template = dotTemplate('index.html')

  const result = await template({
    title: 'Conjure Labs',
    name: 'Tim'
  })

  return result
}
```

### subtemplates

you can embed subtemplates as well

_index.html_
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    @divs(<div>${content}</div>)&()
  </body>
</html>
```

in this example `divs` is expected to be an array of values, that will be passed into the subtemplate `<div>${content}</div>`

```js
import dotTemplate from '@conjurelabs/dot-template'

async function main() {
  const template = dotTemplate('index.html')

  const result = await template({
    title: 'Conjure Labs',
    divs: [{
      content: 'Tim'
    }, {
      content: 'Marshall'
    }]
  })

  return result
}
```

this will end up generating `<div>Tim</div><div>Marshall</div>`

the `&()` is telling the subtemplate to join with an empty string

you can omit `&()` - by default it will join subtemplates with `, `

### missing variables

if you attempt to fill a template, and a variable is missing, a `ReferenceError` will be thrown.

this is consistent with how javascript templates work.

## custom template expressions

in addition to `${regular}` expressions, you can add in your own 'handlers'

```js
import dotTemplate from '@conjurelabs/dot-template'

dotTemplate.addHandler({
  // `expressionPrefix` is required
  // this example would support `@{expression}`s
  expressionPrefix: '@',

  // mutates each value as it goes into the template
  // templateArgs is the original {} values passed to template()
  // additionalArgs is any other trailing args passed to template()
  valueMutator: (value, templateArgs, ...additionalArgs) => value.toUppercase(),

  // mutates each value, only when being console.log'd
  // if this function is not set, the default return will
  // be the value given by `valueMutator`
  // templateArgs is the original {} values passed to template()
  // additionalArgs is any other trailing args passed to template()
  logMutator: (value, templateArgs, ...additionalArgs) => value.toLowercase(),

  // mutates the entire values object,
  // for both applied values and logged values
  // useful if you need to Proxy `values
  // type is either 'applied' or 'logged'
  // additionalArgs is any other trailing args passed to template()
  valuesObjectMutator: (values, type, ...additionalArgs) => new Proxy(value, {
    get: (target, property) => {
      const actualValue = Reflect.get(target, property)

      if (type === 'logged') {
        return actualValue.toLowercase()
      } else {
        return actualValue.toUppercase()
      }
    }
  })
})
```

handlers are run in-order, after the built-in `${}`

### usecase : redactions

a simple use of the difference between `valueMutator` and `logMutator` is when you want to redact sensitive data, like PII

you can support this easily:

```js
dotTemplate.addHandler({
  expressionPrefix: '!',
  logMutator: () => '<REDACTED>'
})
```

now, if you have a template like:

```txt
Hello !{name},
Thank you for your purchase. Your credit card ending in !{ccLastFour} will be charged in two days.

Best,
${company}
```

the filled in template will be as expected, while the value logged to terminal will be munged.

```js
const template = dotTemplate('email.txt')

// content is:
/*
Hello Tim,
Thank you for your purchase. Your credit card ending in 4564 will be charged in two days.

Best,
Conjure Labs
 */
const content = await template({
  name: 'Tim',
  ccLastFour: 4564,
  company: 'Conjure Labs'
})

// prints to terminal:
/*
Hello <REDACTED>,
Thank you for your purchase. Your credit card ending in <REDACTED> will be charged in two days.

Best,
Conjure Labs
 */
console.log(content)
```

### usecase : pg sql

see [pg-dot-template](https://github.com/ConjureLabs/pg-dot-template) for more