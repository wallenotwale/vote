import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const elections = sqliteTable('elections', {
  id: text('id').primaryKey(),           // UUID
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  candidates: text('candidates').notNull(), // JSON-encoded string[]
  votingStart: text('voting_start').notNull(),
  votingEnd: text('voting_end').notNull(),
  namespace: text('namespace').notNull(),   // hex-encoded 29-byte Celestia namespace
  celestiaHeight: integer('celestia_height').notNull(),
  encryptionPubkey: text('encryption_pubkey'),  // base64 — added in Phase 2
  encryptionPrivkey: text('encryption_privkey'), // base64 — added in Phase 2 (keep encrypted)
  createdAt: text('created_at').notNull(),
});

export const nullifiers = sqliteTable('nullifiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  electionId: text('election_id')
    .notNull()
    .references(() => elections.id),
  nullifier: text('nullifier').notNull(), // hex-encoded
  celestiaHeight: integer('celestia_height').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  electionNullifierUnique: uniqueIndex('nullifiers_election_nullifier_uq').on(
    table.electionId,
    table.nullifier,
  ),
}));

export type Election = typeof elections.$inferSelect;
export type NewElection = typeof elections.$inferInsert;

export type Nullifier = typeof nullifiers.$inferSelect;
export type NewNullifier = typeof nullifiers.$inferInsert;
