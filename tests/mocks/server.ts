// MSW Node setup - for API tests running in Node environment
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
