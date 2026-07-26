export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? '',
  adminEmail: (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  isProduction: process.env.NODE_ENV === 'production',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  // Optional: enables the DISPLAY-ONLY phrasing/narrative layers (PRD #11/#39 + the architecture
  // narrative). OpenAI is preferred when set, else Anthropic; with neither, both surfaces pass
  // through to their deterministic text (plain forms / template narrative). Never used to decide
  // a compliance status, score, gap, or citation. See shared/llm-provider.ts.
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
};
