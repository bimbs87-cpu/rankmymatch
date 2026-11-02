import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { template } from './infrastructure-test'

describe('authorized infrastructure test destination', () => {
  it('pins the single test recipient requested by the owner', () => {
    assert.equal(template.to, 'bimbapps@gmail.com')
  })
})