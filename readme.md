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
const path = require('path')

async function main() {
  const template = dotTemplate(path.resolve(__dirname, 'index.html'))

  const result = await template({
    tite: 'Conjure Labs',
    name: 'Tim'
  })

  return result
}
```

### sanitized logs

similar to a normal `${variable}` expression, you can add a private `!{variable}` so that no sensitive information is leaked when console logging.

say you have a file with some PII replacements:

_template.txt_
```txt
Hello !{name},

Thank you for your purchase.
Your credit card ending in '!{ccLastFour}' will be billed for $!{chargeAmount} within the next ${processingDays} business days.
If you have any questions or concerns, please contact us at ${phoneNumber}.
```

and the template is filled with:

```js
const template = dotTemplate(path.resolve(__dirname, 'template.txt'))
const message = await template({
  name: 'Tim',
  ccLastFour: 4547,
  chargeAmount: '22.50',
  processingDays: 'two',
  phoneNumber: '555.234.5678'
})
```

`message`, when treated as a string, will show as:

```txt
Hello Tim,

Thank you for your purchase.
Your credit card ending in '4547' will be billed for $22.50 within the next two business days.
If you have any questions or concerns, please contact us at 555.234.5678.
```

but, if you `console.log` the `message`, Node will show:

```txt
Hello <REDACTED>,

Thank you for your purchase.
Your credit card ending in '<REDACTED>' will be billed for $<REDACTED> within the next two business days.
If you have any questions or concerns, please contact us at 555.234.5678.
```

the caveat with this is that any manipulation or `toString()` calls on `message` will revert back to containing PII.

```js
const message = await template({
  name: 'Tim',
  ccLastFour: 4547,
  chargeAmount: '22.50',
  processingDays: 'two',
  phoneNumber: '555.234.5678'
})

console.log(message) // contains redactions

console.log('' + message) // nothing redacted
```

### scope

since this library relies on [javascript template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), you can also access globals and other variables in scope.

_tempalte.txt_
```txt
Hello ${name},

Thank you for visiting ${companyName}
```

the following fills the template as expected:

```js
const companyName = 'Conjure Labs'

const template = dotTemplate(path.resolve(__dirname, 'template.txt'))
const message = await template({
  name: 'Tim'
})
```

### missing variables

if you attempt to fill a template, and a variable is missing, a `ReferenceError` will be thrown.

this is consistent with how javascript templates work.

### customization

`dot-tempalte` uses environment variables

#### redaction message

by default this library will replace sensitive expressions with `<REDACTED>`.

you can change this by setting `DOT_TEMPLATE_REDACTED_MESSAGE` to your own string.

#### redaction environments

by default `development` will not redact sensitive information.

you can change this by setting `DOT_TEMPLATE_UNREDACTED_ENVS` to a comma-separated list of environments.
