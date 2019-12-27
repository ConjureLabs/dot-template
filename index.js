const fs = require('fs').promises
const path = require('path')

const sqlLookup = {}

async function fetchSql(path) {
  if (sqlLookup[path]) {
    return sqlLookup[path]
  }

  const content = await fs.readFile(path, 'utf8')
  sqlLookup[path] = content
  return content
}

const templatized = (template, vars = {}) => {
  const handler = new Function('vars', [
    'const tagged = ( ' + Object.keys(vars).join(', ') + ' ) =>',
      '`' + template + '`',
    'return tagged(...Object.values(vars))'
  ].join('\n'))

  return handler(vars)
}

async function main() {
  const sql = await fetchSql(path.resolve(__dirname, 'test.sql'))
  
  const result = templatized(sql, {
    limit: 100
  })

  console.log(result)
}
main()
