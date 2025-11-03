import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 1. Import keys directly from @env
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'; 

// 2. Add a Typescript check
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing environment variables. Check that you have .env file with SUPABASE_URL and SUPABASE_ANON_KEY'
  );
}

// 3. Use the variables directly (no "Config." prefix)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});