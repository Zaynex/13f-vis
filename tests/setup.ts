// Test setup - mocks Prisma client
import { vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Load fixtures by name
export function loadFixture<T>(name: string): T {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`)
  const data = fs.readFileSync(fixturePath, 'utf-8')
  return JSON.parse(data) as T
}

// Mock Prisma for API tests
export function createPrismaMock(fixtures: Record<string, unknown>) {
  const mockFindUnique = vi.fn()
  const mockFindMany = vi.fn()
  const mockFindFirst = vi.fn()

  // Configure mock responses based on fixture data
  for (const [key, value] of Object.entries(fixtures)) {
    if (key.includes('institution')) {
      mockFindUnique.mockResolvedValue(value)
    }
    if (key.includes('filing')) {
      mockFindMany.mockResolvedValue(value)
    }
  }

  return {
    institution: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
    },
    filing: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
    holding: {
      findMany: mockFindMany,
    },
    $queryRaw: vi.fn(),
  }
}

// Create a more sophisticated mock that can match queries
export function createFlexiblePrismaMock() {
  return {
    institution: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    filing: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    holding: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  }
}
