import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL in environment");
}
// export const publicUrl = process.env.PUBLIC_URL || "";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


