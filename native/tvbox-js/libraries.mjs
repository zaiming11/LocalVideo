import * as cheerio from 'cheerio/lib/slim'
import CryptoJS from 'crypto-js'
import nunjucks from 'nunjucks/browser/nunjucks'
import { JSONPath } from 'jsonpath-plus'

// TVBox assets expose a small facade in addition to the original libraries.
const templates = new nunjucks.Environment([], { autoescape: false })
export const parser = {
  ...cheerio,
  jinja2: (source, values) => templates.renderString(source, values),
  jp: (expression, value) => JSONPath({ path: expression, json: value, eval: 'safe' })
}
export { CryptoJS }
