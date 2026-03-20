// Test environment setup - runs before all tests
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' })
})

// Reset handlers after each test (in case of test-specific handlers)
afterEach(() => {
  server.resetHandlers()
})

// Close server after all tests
afterAll(() => {
  server.close()
})
