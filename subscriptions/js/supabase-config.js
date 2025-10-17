// Supabase configuration and initialization
const SUPABASE_URL = 'https://psgdmnndsiibdvxihuba.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZ2Rtbm5kc2lpYmR2eGlodWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDgzNDIsImV4cCI6MjA3NjEyNDM0Mn0.dSMlyalrxifFu3Z5FLvT-MhWshzCD7-98-eXz-i8JrU';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other modules
window.supabaseClient = supabaseClient;
