import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm'

// ─── users ───────────────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique().notNull(),
    role: text('role').notNull().default('user'),
    creditBalance: numeric('credit_balance').default('0'),
    failCount: integer('fail_count').default(0),
    frozenUntil: timestamp('frozen_until', { withTimezone: true }),
    passwordHash: text('password_hash').notNull(),
    emailConfirmed: boolean('email_confirmed').default(false).notNull(),
    proxyMode: text('proxy_mode').notNull().default('disabled'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_users_email').on(t.email),
    check('users_role_check', sql`${t.role} IN ('user', 'admin', 'super_admin')`),
    check('users_proxy_mode_check', sql`${t.proxyMode} IN ('disabled', 'manual', 'rotate')`),
  ],
)

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>

// ─── email_confirm_tokens ────────────────────────────────────────────────────
export const emailConfirmTokens = pgTable(
  'email_confirm_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: text('token').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_ect_token').on(t.token),
    index('idx_ect_expires').on(t.expiresAt),
  ],
)

export type EmailConfirmToken = InferSelectModel<typeof emailConfirmTokens>
export type NewEmailConfirmToken = InferInsertModel<typeof emailConfirmTokens>

// ─── transactions ────────────────────────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    paymentId: text('payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_transactions_user_id').on(t.userId),
    index('idx_transactions_status').on(t.status),
    uniqueIndex('idx_transactions_payment_id_unique')
      .on(t.paymentId)
      .where(sql`payment_id IS NOT NULL AND payment_id LIKE 'refund_%'`),
    check('transactions_type_check', sql`${t.type} IN ('topup', 'deduction')`),
    check(
      'transactions_status_check',
      sql`${t.status} IN ('pending', 'completed', 'failed', 'expired', 'cancelled')`,
    ),
  ],
)

export type Transaction = InferSelectModel<typeof transactions>
export type NewTransaction = InferInsertModel<typeof transactions>

// ─── installations ───────────────────────────────────────────────────────────
export const installations = pgTable(
  'installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    installId: text('install_id').unique().notNull(),
    vpsIp: text('vps_ip').notNull(),
    windowsVersion: text('windows_version').notNull(),
    rdpType: text('rdp_type').notNull(),
    status: text('status').notNull().default('pending'),
    progressStep: integer('progress_step').default(0),
    progressMessage: text('progress_message'),
    rdpPassword: text('rdp_password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_installations_user_id').on(t.userId),
    index('idx_installations_status').on(t.status),
    check('installations_rdp_type_check', sql`${t.rdpType} IN ('docker', 'dedicated')`),
    check(
      'installations_status_check',
      sql`${t.status} IN ('pending', 'in_progress', 'completed', 'failed')`,
    ),
  ],
)

export type Installation = InferSelectModel<typeof installations>
export type NewInstallation = InferInsertModel<typeof installations>

// ─── payment_tracking ────────────────────────────────────────────────────────
export const paymentTracking = pgTable(
  'payment_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    qrCodeUrl: text('qr_code_url').notNull(),
    gatewayPaymentId: text('gateway_payment_id').notNull(),
    pollCount: integer('poll_count').default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_payment_tracking_transaction_id').on(t.transactionId)],
)

export type PaymentTracking = InferSelectModel<typeof paymentTracking>
export type NewPaymentTracking = InferInsertModel<typeof paymentTracking>

// ─── app_settings ────────────────────────────────────────────────────────────
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
})

export type AppSetting = InferSelectModel<typeof appSettings>
export type NewAppSetting = InferInsertModel<typeof appSettings>

// ─── changelog ───────────────────────────────────────────────────────────────
export const changelog = pgTable(
  'changelog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(),
    showPopup: boolean('show_popup').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    check('changelog_category_check', sql`${t.category} IN ('update', 'maintenance', 'info')`),
  ],
)

export type Changelog = InferSelectModel<typeof changelog>
export type NewChangelog = InferInsertModel<typeof changelog>

// ─── os_versions ─────────────────────────────────────────────────────────────
export const osVersions = pgTable('os_versions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('desktop'),
  enabled: boolean('enabled').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type OsVersion = InferSelectModel<typeof osVersions>
export type NewOsVersion = InferInsertModel<typeof osVersions>

// ─── do_accounts ─────────────────────────────────────────────────────────────
export const doAccounts = pgTable(
  'do_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    email: text('email'),
    status: text('status').default('active'),
    balance: numeric('balance').default('0'),
    dropletLimit: integer('droplet_limit').default(0),
    lastChecked: timestamp('last_checked', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_do_accounts_user').on(t.userId)],
)

export type DoAccount = InferSelectModel<typeof doAccounts>
export type NewDoAccount = InferInsertModel<typeof doAccounts>

// ─── do_proxies ──────────────────────────────────────────────────────────────
export const doProxies = pgTable(
  'do_proxies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    protocol: text('protocol').notNull().default('http'),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username'),
    password: text('password'),
    isSelected: boolean('is_selected').default(false),
    label: text('label'),
    status: text('status').notNull().default('unchecked'),
    lastChecked: timestamp('last_checked', { withTimezone: true }),
    responseTime: integer('response_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_do_proxies_user').on(t.userId),
    check('do_proxies_status_check', sql`${t.status} IN ('unchecked', 'active', 'failed')`),
  ],
)

export type DoProxy = InferSelectModel<typeof doProxies>
export type NewDoProxy = InferInsertModel<typeof doProxies>

// ─── do_droplets ─────────────────────────────────────────────────────────────
export const doDroplets = pgTable(
  'do_droplets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => doAccounts.id, { onDelete: 'cascade' }),
    dropletId: bigint('droplet_id', { mode: 'number' }).notNull(),
    name: text('name'),
    ipAddress: text('ip_address'),
    region: text('region'),
    size: text('size'),
    image: text('image'),
    status: text('status').default('new'),
    // RDP install intent — saved at create time, processed by backend
    pendingRdp: boolean('pending_rdp').default(false),
    rdpPassword: text('rdp_password'),
    windowsVersion: text('windows_version'),
    rdpType: text('rdp_type').default('dedicated'),
    rdpStatus: text('rdp_status'), // pending_ip | pending_active | pending_ssh | triggering | triggered | failed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_do_droplets_user').on(t.userId)],
)

export type DoDroplet = InferSelectModel<typeof doDroplets>
export type NewDoDroplet = InferInsertModel<typeof doDroplets>

// ─── activity_log ────────────────────────────────────────────────────────────
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    details: jsonb('details').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_activity_log_user').on(t.userId),
    index('idx_activity_log_created').on(t.createdAt),
  ],
)

export type ActivityLog = InferSelectModel<typeof activityLog>
export type NewActivityLog = InferInsertModel<typeof activityLog>

// ─── password_reset_tokens ───────────────────────────────────────────────────
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_prt_token').on(t.token),
    index('idx_prt_expires').on(t.expiresAt),
  ],
)

export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>
export type NewPasswordResetToken = InferInsertModel<typeof passwordResetTokens>

// ─── user_sessions ───────────────────────────────────────────────────────────
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .unique()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_user_sessions_user').on(t.userId),
    index('idx_user_sessions_session').on(t.sessionId),
  ],
)

export type UserSession = InferSelectModel<typeof userSessions>
export type NewUserSession = InferInsertModel<typeof userSessions>

// ─── free_credit_tracking ────────────────────────────────────────────────────
export const freeCreditTracking = pgTable(
  'free_credit_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    amount: numeric('amount').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    expired: boolean('expired').default(false).notNull(),
    expiredAmount: numeric('expired_amount').default('0'),
  },
  (t) => [
    index('idx_fct_user').on(t.userId),
    index('idx_fct_expires').on(t.expiresAt),
  ],
)

export type FreeCreditTracking = InferSelectModel<typeof freeCreditTracking>
export type NewFreeCreditTracking = InferInsertModel<typeof freeCreditTracking>
