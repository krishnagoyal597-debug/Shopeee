import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lypepdghsmutxlneckib.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cGVwZGdoc211dHhsbmVja2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTU3MTgsImV4cCI6MjA5OTY3MTcxOH0.eCgAUDjkxKvf9awdu_5tPGBR_92SCNzQqJKR9PWWDQk';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your environment configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
