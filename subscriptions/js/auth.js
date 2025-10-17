// Authentication module
class AuthManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentUser = null;
        this.authStateCallbacks = [];
    }

    // Initialize authentication state listener
    async init() {
        // Get initial session
        const { data: { session } } = await this.supabase.auth.getSession();
        this.currentUser = session?.user || null;
        this.updateUI();

        // Listen for auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            this.currentUser = session?.user || null;
            this.updateUI();

            // Notify callbacks
            this.authStateCallbacks.forEach(callback => callback(this.currentUser));
        });
    }

    // Sign in with email and password
    async signInWithEmail(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error signing in:', error);
            return { success: false, error: error.message };
        }
    }

    // Sign up with email and password
    async signUpWithEmail(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error signing up:', error);
            return { success: false, error: error.message };
        }
    }

    // Sign in with Google
    async signInWithGoogle() {
        try {
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + window.location.pathname
                }
            });

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error signing in:', error);
            return { success: false, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error signing out:', error);
            return { success: false, error: error.message };
        }
    }

    // Update UI based on authentication state
    updateUI() {
        const authSection = document.getElementById('auth-section');
        const appSection = document.getElementById('app-section');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');
        const userAvatar = document.getElementById('user-avatar');

        if (this.currentUser) {
            // User is signed in
            if (authSection) authSection.style.display = 'none';
            if (appSection) appSection.style.display = 'block';
            if (userInfo) userInfo.style.display = 'flex';

            // Display user info
            if (userName) {
                userName.textContent = this.currentUser.user_metadata?.full_name ||
                                      this.currentUser.email?.split('@')[0] ||
                                      'User';
            }
            if (userAvatar && this.currentUser.user_metadata?.avatar_url) {
                userAvatar.src = this.currentUser.user_metadata.avatar_url;
                userAvatar.style.display = 'block';
            }
        } else {
            // User is signed out
            if (authSection) authSection.style.display = 'flex';
            if (appSection) appSection.style.display = 'none';
            if (userInfo) userInfo.style.display = 'none';
        }
    }

    // Register callback for auth state changes
    onAuthStateChange(callback) {
        this.authStateCallbacks.push(callback);
    }

    // Get current user
    getUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();
