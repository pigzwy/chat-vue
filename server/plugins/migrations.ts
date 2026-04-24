import { mkdir } from 'node:fs/promises'
import { definePlugin } from 'nitro'
import { useLibSQLClient } from '../utils/drizzle'

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS chats (
    id text PRIMARY KEY NOT NULL,
    title text,
    user_id text NOT NULL,
    visibility text DEFAULT 'private' NOT NULL,
    created_at integer NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS chats_user_id_idx ON chats (user_id)',
  `CREATE TABLE IF NOT EXISTS messages (
    id text PRIMARY KEY NOT NULL,
    chat_id text NOT NULL,
    role text NOT NULL,
    parts text,
    created_at integer NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE cascade
  )`,
  'CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id)',
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    avatar text NOT NULL,
    username text NOT NULL,
    provider text NOT NULL,
    provider_id text NOT NULL,
    created_at integer NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS users_provider_id_idx ON users (provider, provider_id)',
  `CREATE TABLE IF NOT EXISTS votes (
    chat_id text NOT NULL,
    message_id text NOT NULL,
    is_upvoted integer NOT NULL,
    PRIMARY KEY (chat_id, message_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE cascade,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE cascade
  )`
]

async function ensureChatVisibilityColumn() {
  const client = useLibSQLClient()
  const result = await client.execute('PRAGMA table_info(chats)')
  const hasVisibility = result.rows.some(row => row.name === 'visibility')

  if (hasVisibility) return

  try {
    await client.execute("ALTER TABLE chats ADD COLUMN visibility text DEFAULT 'private' NOT NULL")
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error
    }
  }
}

export default definePlugin(async () => {
  await mkdir('.data', { recursive: true })

  const client = useLibSQLClient()
  for (const statement of schemaStatements) {
    await client.execute(statement)
  }
  await ensureChatVisibilityColumn()
})
