import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema',
  out: './packages/db/drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://swipeless:swipeless@localhost:5434/swipeless',
  },
})
