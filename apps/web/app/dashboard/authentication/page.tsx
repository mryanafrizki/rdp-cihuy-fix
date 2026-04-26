'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Mail, Eye, EyeOff, Shield, AlertTriangle } from 'lucide-react'
import { showToast } from '@/components/ui/toast-notification'

export default function AuthenticationPage() {
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      if (d.success) setUserEmail(d.data.email)
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-lg mx-auto py-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Authentication</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage your account security</p>
      </div>
      
      <ChangePasswordSection />
      <ResetPasswordSection email={userEmail} />
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChangePassword = async () => {
    setError(''); setSuccess('');
    if (!currentPassword) { setError('Current password is required'); return; }
    if (newPassword.length < 6) { setError('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Password changed successfully. Logging out...');
        showToast('Password changed successfully. Logging out...', 'success');
        setTimeout(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }, 2000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Lock className="size-4" style={{ color: 'var(--q-accent)' }} />
        <h2 className="text-lg font-semibold text-white">Change Password</h2>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Current Password</label>
          <div className="relative">
            <input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-white pr-10"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }} />
            <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>New Password</label>
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-white pr-10"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }} />
            <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-white"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }} />
        </div>
        
        {error && <p className="text-sm" style={{ color: 'var(--rose)' }}>{error}</p>}
        {success && <p className="text-sm" style={{ color: 'var(--green)' }}>{success}</p>}
        
        <button onClick={handleChangePassword} disabled={loading}
          className="w-full py-2.5 rounded-xl font-medium text-sm text-black disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--q-accent)' }}>
          {loading ? 'Changing...' : 'Change Password & Logout'}
        </button>
        
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <Shield className="size-3 inline mr-1" />
          You will be logged out of all sessions after changing your password
        </p>
      </div>
    </motion.div>
  );
}

function ResetPasswordSection({ email }: { email: string }) {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const handleResetPassword = async () => {
    setShowConfirm(false)
    setError('');
    if (!email) { setError('Email not loaded yet'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'dashboard' })
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        showToast('Reset link sent! Check your email. Logging out...', 'success');
        setTimeout(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }, 3000);
      } else {
        setError(data.error || 'Failed to send reset email');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Mail className="size-4" style={{ color: 'var(--q-accent)' }} />
        <h2 className="text-lg font-semibold text-white">Reset Password</h2>
      </div>
      
      {sent ? (
        <div className="text-center py-4">
          <p className="text-sm text-white">Reset link sent to <strong>{email}</strong></p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Check your email and follow the instructions. Logging out...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Email Address</label>
            <input type="email" value={email} readOnly
              className="w-full px-4 py-2.5 rounded-xl text-[var(--text-secondary)] cursor-not-allowed"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }} />
          </div>
          
          {error && <p className="text-sm" style={{ color: 'var(--rose)' }}>{error}</p>}
          
          <button onClick={() => setShowConfirm(true)} disabled={loading || !email}
            className="w-full py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <Shield className="size-3 inline mr-1" />
            A reset link will be sent to your email. All sessions will be logged out.
          </p>
        </div>
      )}

      {/* Confirmation popup */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="max-w-sm w-full rounded-2xl p-6 text-center"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
              <AlertTriangle className="size-12 mx-auto" style={{ color: 'var(--amber)' }} />
              <h3 className="text-lg font-bold text-white mt-4">Reset Password?</h3>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                A reset link will be sent to <strong className="text-white">{email}</strong>. 
                All active sessions will be logged out.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  Cancel
                </button>
                <button onClick={handleResetPassword}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                  style={{ background: 'var(--rose)', color: '#fff' }}>
                  Yes, Reset
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
