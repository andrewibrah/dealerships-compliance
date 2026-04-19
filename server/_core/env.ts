export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? '',
  adminEmail: (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  isProduction: process.env.NODE_ENV === 'production',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
};
