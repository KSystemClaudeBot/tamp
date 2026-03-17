import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tryParseJSON, isTOON, classifyContent } from '../detect.js'

describe('tryParseJSON', () => {
  it('parses valid JSON object', () => {
    const r = tryParseJSON('{"a":1}')
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, { a: 1 })
  })

  it('parses valid JSON array', () => {
    const r = tryParseJSON('[1,2,3]')
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, [1, 2, 3])
  })

  it('parses pretty-printed JSON', () => {
    const r = tryParseJSON('{\n  "key": "val"\n}')
    assert.equal(r.ok, true)
  })

  it('rejects Python dict repr', () => {
    assert.equal(tryParseJSON("{'key': 'val'}").ok, false)
  })

  it('rejects truncated JSON', () => {
    assert.equal(tryParseJSON('{"key": "val"').ok, false)
  })

  it('rejects empty string', () => {
    assert.equal(tryParseJSON('').ok, false)
  })

  it('rejects non-string input', () => {
    assert.equal(tryParseJSON(42).ok, false)
    assert.equal(tryParseJSON(null).ok, false)
    assert.equal(tryParseJSON(undefined).ok, false)
  })
})

describe('isTOON', () => {
  it('detects header pattern with braces', () => {
    assert.equal(isTOON('items[3]{sku,qty,price}:\nA1,5,9.99'), true)
  })

  it('detects header pattern with colon', () => {
    assert.equal(isTOON('rows[10]:\nfoo,bar'), true)
  })

  it('detects [TOON] prefix', () => {
    assert.equal(isTOON('[TOON] some data'), true)
  })

  it('rejects regular JSON', () => {
    assert.equal(isTOON('{"a":1}'), false)
  })

  it('rejects plain text', () => {
    assert.equal(isTOON('hello world'), false)
  })

  it('rejects non-string', () => {
    assert.equal(isTOON(123), false)
  })
})

describe('classifyContent', () => {
  it('classifies valid JSON as json', () => {
    assert.equal(classifyContent('{"a":1}'), 'json')
  })

  it('classifies TOON as toon', () => {
    assert.equal(classifyContent('items[3]{sku,qty}:\nA,1'), 'toon')
  })

  it('classifies markdown as text', () => {
    assert.equal(classifyContent('# Hello\nThis is markdown'), 'text')
  })

  it('classifies code as text', () => {
    assert.equal(classifyContent('function foo() { return 1 }'), 'text')
  })

  it('classifies non-string as unknown', () => {
    assert.equal(classifyContent(null), 'unknown')
  })
})
