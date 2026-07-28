export const ENV = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  supabaseServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  // APP_DB_URL first: the platform injects its own `SUPABASE_DB_URL` into every Edge
  // Function and the `SUPABASE_` prefix is reserved, so `supabase secrets set` refuses to
  // override it ("Env name cannot start with SUPABASE_"). APP_DB_URL is therefore the only
  // way to point the Edge runtime at the Supavisor SESSION-mode pooler (port 5432), which
  // is what the driver requires — see shared/db-options.ts for the measurements.
  supabaseDbUrl: Deno.env.get('APP_DB_URL') ?? Deno.env.get('SUPABASE_DB_URL') ?? '',
  adminEmail: Deno.env.get('ADMIN_EMAIL') ?? '',
  stripeSecretKey: Deno.env.get('STRIPE_SECRET_KEY') ?? '',
  stripeWebhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  stripeCorePrice: Deno.env.get('STRIPE_CORE_PRICE_ID') ?? '',
  stripeManagedPrice: Deno.env.get('STRIPE_MANAGED_PRICE_ID') ?? '',
  resendApiKey: Deno.env.get('RESEND_API_KEY') ?? '',
  openaiApiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  // Optional: enables the conversational question-phrasing layer (PRD #11/#39). Absent by
  // default -> rephrase passthrough (plain forms). Never used to decide compliance.
  anthropicApiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
  appUrl: Deno.env.get('VITE_APP_URL') ?? 'https://andrewibrah.github.io/dealerships-compliance',
};
