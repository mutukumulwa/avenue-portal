import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Unmount everything between tests.
 *
 * Vitest only auto-cleans when `globals: true` AND the testing-library auto-cleanup
 * entry point is loaded; this project loads the matchers only, so rendered trees
 * were accumulating in `document.body` for the whole file. The symptom is
 * "Found multiple elements with the text ..." in the SECOND test that renders
 * similar copy — a failure caused by the previous test, not by the code under test.
 *
 * Added by UAT-HF P01.01 after it bit the mutation-envelope tests.
 */
afterEach(() => {
  cleanup()
})
