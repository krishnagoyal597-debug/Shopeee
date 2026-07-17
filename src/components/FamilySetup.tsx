import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, ArrowRight, UserPlus, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import type { Profile } from '../types';
import { api } from '../api';

interface FamilySetupProps {
  profile: Profile;
  onSetupComplete: () => void;
  onLogout: () => void;
}

// Check if the display name looks like it needs updating (phone number or default)
const needsDisplayName = (name: string) => {
  return !name || name === 'Family Member' || /^\+?\d{10,}$/.test(name);
};

export const FamilySetup: React.FC<FamilySetupProps> = ({ profile, onSetupComplete, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState(needsDisplayName(profile.display_name) ? '' : profile.display_name);
  const [familyName, setFamilyName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showNameField = needsDisplayName(profile.display_name);


  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!familyName.trim()) {
      setError('Please enter a name for your family group.');
      setLoading(false);
      return;
    }

    if (showNameField && !displayName.trim()) {
      setError('Please enter your display name (e.g. Mom, Sarah).');
      setLoading(false);
      return;
    }

    try {
      // 0. Update display name if needed
      if (showNameField && displayName.trim()) {
        await api.updateProfile({ display_name: displayName.trim() });
      }

      // 1. Call Python API to create family (and link profile)
      const familyData = await api.createFamily(familyName.trim(), whatsappPhone.trim() || undefined);
      const uniqueCode = familyData.code;

      // 2. Send Email Notification with Web3Forms
      const { data: { user } } = await supabase.auth.getUser();
      const web3formsKey = import.meta.env.VITE_WEB3FORMS_KEY || '';
      
      let emailInfo = '';
      if (user?.email && web3formsKey) {
        try {
          await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              access_key: web3formsKey,
              subject: `🏡 Family Invite Code: ${uniqueCode}`,
              from_name: 'Family Grocery App',
              email: user.email,
              message: `Hello ${profile.display_name},\n\nYour family group "${familyName}" has been created!\n\nUse this unique code to invite your family members:\nInvite Code: ${uniqueCode}\n\nThey can join your family by entering this code on the registration page.\n\nBest regards,\nFamily Grocery App`
            })
          });
          emailInfo = ' (sent to your email)';
        } catch (emailErr) {
          console.error('Error sending email:', emailErr);
        }
      }

      setSuccess(`Success! Family "${familyName}" created with code: ${uniqueCode}${emailInfo}`);
      
      setTimeout(() => {
        onSetupComplete();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Error creating family group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formattedCode = familyCode.toUpperCase().trim();
    if (!formattedCode) {
      setError('Please enter a family group code.');
      setLoading(false);
      return;
    }

    if (showNameField && !displayName.trim()) {
      setError('Please enter your display name (e.g. Mom, Sarah).');
      setLoading(false);
      return;
    }

    try {
      // 0. Update display name if needed
      if (showNameField && displayName.trim()) {
        await api.updateProfile({ display_name: displayName.trim() });
      }

      // 1. Call Python API to join the family
      await api.joinFamily(formattedCode);
      setSuccess(`Joined family successfully!`);
      
      setTimeout(() => {
        onSetupComplete();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Error joining family group.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} className="animate-fade-in">
        <h2 style={styles.welcomeTitle}>Welcome{!showNameField ? `, ${profile.display_name}` : ''}! 👋</h2>
        <p style={styles.welcomeSubtitle}>To get started, you need to either create a new family group or join an existing one.</p>
      </div>

      <div className="glass-card animate-fade-in" style={styles.card}>
        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === 'create' ? styles.activeTab : {}),
            }}
            onClick={() => {
              setActiveTab('create');
              setError(null);
              setSuccess(null);
            }}
          >
            <Plus size={18} />
            Create Family
          </button>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === 'join' ? styles.activeTab : {}),
            }}
            onClick={() => {
              setActiveTab('join');
              setError(null);
              setSuccess(null);
            }}
          >
            <UserPlus size={18} />
            Join Family
          </button>
        </div>

        {error && (
          <div style={styles.alertError}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={styles.alertSuccess}>
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {activeTab === 'create' ? (
          <form onSubmit={handleCreateFamily} style={styles.form}>
            {showNameField && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Your Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mom, Sister Sarah, Papa"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  disabled={loading}
                />
                <span style={styles.helperText}>How your family will see you in the app.</span>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Family Group Name</label>
              <input
                type="text"
                placeholder="e.g. Goyal Family, Sweet Home"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                required
                disabled={loading}
              />
              <span style={styles.helperText}>Creating a group gives you a unique code to invite others.</span>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>WhatsApp Phone Number (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 917240717609 or 7240717609"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                disabled={loading}
              />
              <span style={styles.helperText}>Used to send grocery list updates. E.g., include country code without "+". If 10 digits, default is India (+91).</span>
            </div>

            <button type="submit" className="btn-primary" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Creating...' : 'Create & Proceed'}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinFamily} style={styles.form}>
            {showNameField && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Your Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mom, Sister Sarah, Papa"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  disabled={loading}
                />
                <span style={styles.helperText}>How your family will see you in the app.</span>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Family Unique Code</label>
              <input
                type="text"
                placeholder="e.g. FAM-AB12CD"
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value)}
                required
                disabled={loading}
              />
              <span style={styles.helperText}>Ask the family group creator for their unique join code.</span>
            </div>

            <button type="submit" className="btn-primary" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Joining...' : 'Join Family Group'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        <hr style={styles.divider} />

        <button onClick={onLogout} className="btn-secondary" style={styles.logoutBtn}>
          <LogOut size={16} />
          Sign Out of Account
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '28px',
    maxWidth: '500px',
  },
  welcomeTitle: {
    fontSize: '2rem',
    fontWeight: '700',
    marginBottom: '8px',
  },
  welcomeSubtitle: {
    color: '#94a3b8',
    fontSize: '0.95rem',
  },
  card: {
    width: '100%',
    maxWidth: '460px',
  },
  tabs: {
    display: 'flex',
    background: 'rgba(15, 23, 42, 0.4)',
    padding: '4px',
    borderRadius: '10px',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tabButton: {
    flex: 1,
    padding: '10px',
    fontSize: '0.9rem',
    borderRadius: '8px',
    background: 'transparent',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '500',
    color: '#cbd5e1',
  },
  helperText: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginTop: '2px',
  },
  submitBtn: {
    width: '100%',
  },
  divider: {
    border: 'none',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    margin: '24px 0 16px 0',
  },
  logoutBtn: {
    width: '100%',
    fontSize: '0.9rem',
  },
  alertError: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.9rem',
  },
  alertSuccess: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.9rem',
  },
};
