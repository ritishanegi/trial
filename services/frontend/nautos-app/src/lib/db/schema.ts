import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Custom type for pgvector — Drizzle doesn't have native vector support
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

// ─── Core tables ────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 63 }).unique().notNull(),
  plan: varchar("plan", { length: 50 }).notNull().default("branded"),
  maxVessels: integer("max_vessels").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("engineer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_users_email").on(table.email),
    index("idx_users_tenant").on(table.tenantId),
  ]
);

export const vessels = pgTable(
  "vessels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    imo: varchar("imo", { length: 20 }),
    vesselType: varchar("vessel_type", { length: 100 }),
    flagState: varchar("flag_state", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_vessels_tenant").on(table.tenantId)]
);

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    manufacturer: varchar("manufacturer", { length: 255 }).notNull(),
    modelType: varchar("model_type", { length: 255 }).notNull(),
    serialNumber: varchar("serial_number", { length: 255 }),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_equipment_tenant").on(table.tenantId)]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    title: varchar("title", { length: 500 }).notNull(),
    docType: varchar("doc_type", { length: 100 }).notNull(),
    scope: varchar("scope", { length: 20 }).notNull().default("vessel"),
    manufacturer: varchar("manufacturer", { length: 255 }),
    modelType: varchar("model_type", { length: 255 }),
    versionYear: varchar("version_year", { length: 20 }),
    s3Key: text("s3_key").notNull(),
    pageCount: integer("page_count"),
    ocrStatus: varchar("ocr_status", { length: 20 }).notNull().default("pending"),
    masterEligible: boolean("master_eligible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_documents_tenant").on(table.tenantId),
    index("idx_documents_vessel").on(table.vesselId),
    index("idx_documents_scope").on(table.tenantId, table.scope),
  ]
);

// ─── Embeddings ─────────────────────────────────────────────────

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chunkText: text("chunk_text").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    pageNumber: integer("page_number"),
    embedding: vector("embedding").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_embeddings_document").on(table.documentId),
    index("idx_embeddings_tenant").on(table.tenantId),
  ]
);

// ─── Master Library ─────────────────────────────────────────────

export const masterLibrary = pgTable(
  "master_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    title: varchar("title", { length: 500 }).notNull(),
    docType: varchar("doc_type", { length: 100 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 255 }),
    modelType: varchar("model_type", { length: 255 }),
    versionYear: varchar("version_year", { length: 20 }),
    reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_master_status").on(table.reviewStatus)]
);

export const masterEmbeddings = pgTable(
  "master_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    masterId: uuid("master_id")
      .notNull()
      .references(() => masterLibrary.id, { onDelete: "cascade" }),
    chunkText: text("chunk_text").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    pageNumber: integer("page_number"),
    embedding: vector("embedding").notNull(),
    metadata: jsonb("metadata").default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_master_embeddings_master").on(table.masterId)]
);

// ─── Ingestion + Query tracking ─────────────────────────────────

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    totalPages: integer("total_pages"),
    processedPages: integer("processed_pages").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_jobs_document").on(table.documentId)]
);

export const queryLog = pgTable(
  "query_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    question: text("question").notNull(),
    answer: text("answer"),
    sources: jsonb("sources"),
    responseTimeMs: integer("response_time_ms"),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_querylog_tenant").on(table.tenantId),
    index("idx_querylog_created").on(table.tenantId, table.createdAt),
  ]
);

// ─── Onboarding + Invitations ───────────────────────────────────

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 50 }).notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_onboarding_tenant_step").on(table.tenantId, table.step),
  ]
);

export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("engineer"),
    token: varchar("token", { length: 255 }).unique().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_invite_token").on(table.token)]
);

// ─── White-label branding ───────────────────────────────────────

export const tenantBranding = pgTable("tenant_branding", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .unique()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  productName: varchar("product_name", { length: 255 }),
  primaryColor: varchar("primary_color", { length: 7 }).default("#06b6d4"),
  secondaryColor: varchar("secondary_color", { length: 7 }).default("#0f172a"),
  logoS3Key: text("logo_s3_key"),
  faviconS3Key: text("favicon_s3_key"),
  customDomain: varchar("custom_domain", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Master Library moderation ──────────────────────────────────

export const masterRejectionLog = pgTable(
  "master_rejection_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    masterId: uuid("master_id")
      .notNull()
      .references(() => masterLibrary.id, { onDelete: "cascade" }),
    rejectedBy: uuid("rejected_by")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_rejection_master").on(table.masterId)]
);

// ─── Chat sessions and messages ─────────────────────────────────

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id").references(() => vessels.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_sessions_user").on(table.userId, table.updatedAt),
    index("idx_chat_sessions_tenant").on(table.tenantId),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
    content: text("content").notNull(),
    sources: jsonb("sources"),
    tokensUsed: integer("tokens_used"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_chat_messages_session").on(table.sessionId, table.createdAt)]
);
