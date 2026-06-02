/** Resolve variáveis Supabase no servidor (aceita nomes com e sem prefixo VITE_). */
export function getSupabaseServerUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
}

export function getSupabasePublishableKey(): string | undefined {
  return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
