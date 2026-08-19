import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * The publishable key is safe to ship in client code — it grants no access on
 * its own. Postgres row-level security is what actually restricts a signed-in
 * user to their own account, not the secrecy of this key.
 */
export const supabase = createClient(url, publishableKey);
