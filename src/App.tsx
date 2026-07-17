import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { Profile } from './types';
import { Auth } from './components/Auth';
import { FamilySetup } from './components/FamilySetup';
import { Dashboard } from './components/Dashboard';
import { RefreshCw, ShoppingBasket } from 'lucide-react';
import { api } from './api';

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the profile for the logged in user
  const fetchUserProfile = async () => {
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (err: any) {
      console.warn('Profile not found, retrying in 1s...', err);
      // Wait a moment for trigger function in Supabase DB to complete profile insert
      setTimeout(async () => {
        try {
          const retryData = await api.getProfile();
          setProfile(retryData);
        } catch (retryErr) {
          console.error('Error on profile retry:', retryErr);
        } finally {
          setLoading(false);
        }
      }, 1000);
      return;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile();
      } else {
        setLoading(false);
      }
    });

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          setLoading(true);
          await fetchUserProfile();
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setLoading(false);
  };

  const handleAuthSuccess = () => {
    // Triggered after signing in or verifying OTP
    // This will cause the auth state listener to trigger and reload profile
  };

  const handleSetupComplete = async () => {
    // Triggered after joining/creating a family
    if (session?.user) {
      setLoading(true);
      await fetchUserProfile();
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <ShoppingBasket size={48} color="#2dd4bf" className="animate-pulse" />
        <h2 style={styles.loadingText}>Syncing Family Groceries...</h2>
        <div style={styles.spinnerWrapper}>
          <RefreshCw className="animate-spin" size={24} color="#2dd4bf" />
        </div>
      </div>
    );
  }

  // View state machine
  return (
    <div style={styles.appWrapper}>
      {!session ? (
        <Auth onAuthSuccess={handleAuthSuccess} />
      ) : !profile || !profile.family_id ? (
        <FamilySetup 
          profile={profile || { id: session.user.id, family_id: null, display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || session.user.email || 'Family Member', role: 'member', updated_at: '' }} 
          onSetupComplete={handleSetupComplete}
          onLogout={handleLogout}
        />
      ) : (
        <Dashboard 
          profile={profile}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appWrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #090e17 0%, #0e1726 50%, #050a12 100%)',
    color: '#f8fafc',
  },
  loadingText: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginTop: '16px',
    background: 'linear-gradient(135deg, #ffffff 0%, #2dd4bf 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  spinnerWrapper: {
    marginTop: '20px',
  },
};

export default App;
