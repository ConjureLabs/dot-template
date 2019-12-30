# dot-template

`dot-template` allows you to save templatized flatfiles, with added niceties

this library uses built-in [javascript template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

## install

```
npm i @conjurelabs/dot-template
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
const dotTemplate = require('@conjurelabs/dot-template')

async function main() {
  const template = dotTemplate('index.html')

  const result = await template({
    title: 'Conjure Labs',
    name: 'Tim'
  })

  return result
}
```

### scope

since this library relies on [javascript template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), you can also access globals and other variables in scope.

_template.txt_
```txt
Hello ${name},

Thank you for visiting ${companyName}
```

the following fills the template as expected:

```js
const companyName = 'Conjure Labs'

const template = dotTemplate('template.txt')
const message = await template({
  name: 'Tim'
})
```

### missing variables

if you attempt to fill a template, and a variable is missing, a `ReferenceError` will be thrown.

this is consistent with how javascript templates work.

## custom template expressions

in addition to `${regular}` expressions, you can add in your own 'handlers'

```js
const dotTemplate = require('@conjurelabs/dot-template')

dotTemplate.addHandler({
  // `expressionPrefix` is required
  // this example would support `@{expression}`s
  expressionPrefix: '@',

  // mutates each value as it goes into the template
  // templateArgs is every argument passed to template()
  valueMutator: (value, ...templateArgs) => value.toUppercase(),

  // mutates each value, only when being console.log'd
  // if this function is not set, the default return will
  // be the value given by `valueMutator`
  // templateArgs is every argument passed to template()
  logMutator: (value, ...templateArgs) => value.toLowercase()
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

say you have a query, and you plan to use it with [the pg module](https://node-postgres.com/)

the `pg` module uses `$1` replacements - you would want the real value of your template to be built with these integers, while printing actual or redacted values to the terminal.

_query.sql_
```sql
select *
from users
where id = $@{id}
and name = !@{name}
```

```js
const dotTemplate = require('@conjurelabs/dot-template')
const { Client } = require('pg')

const client = new Client()
await client.connect()

// using '$@' to denote values where the
// literal result should be a number like '$1' (indexed)
// but the actual value sould be printed to terminal
dotTemplate.addHandler({
  expressionPrefix: '$@',
  valueMutator: (value, templateArgs, pgQueryArgs) => {
    const index = pgQueryArgs.indexOf(value)
    return `$${index + 1}`
  },
  logMutator: (value, templateArgs) => value
})

// using '!@' to denote values where the
// literal result should be a number like '$1' (indexed)
// but the value printed to terminal should be redacted
dotTemplate.addHandler({
  expressionPrefix: '!@',
  valueMutator: (value, templateArgs, pgQueryArgs) => {
    const index = pgQueryArgs.indexOf(value)
    return `$${index + 1}`
  },
  logMutator: (value, templateArgs) => '<REDACTED>'
})

async function main() {
  const template = dotTemplate('query.sql')

  const pgQueryArgs = [4025, 'Tim']

  const queryString = await template({
    id: 4025,
    name: 'Tim'
  }, pgQueryArgs)

  // prints:
  /*
    select *
    from users
    where id = 4025
    and name = <REDACTED>
  */
  console.log(queryString)

  // passes query string:
  /*
    select *
    from users
    where id = $1
    and name = $2
  */
  const res = await client.query(queryString, pgQueryArgs)

  console.log(res.rows[0])
}
main()
```
