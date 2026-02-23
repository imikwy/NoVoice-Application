import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(form.username, form.email, form.password, form.displayName || form.username);
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-nv-accent/[0.03] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 w-full max-w-[380px] mx-auto px-6"
      >
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: 'easeOut' }}
            className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-nv-accent to-emerald-600 flex items-center justify-center shadow-lg shadow-nv-accent/20"
          >
            <span className="text-2xl font-bold text-white">N</span>
          </motion.div>
          <h1 className="text-2xl font-semibold text-nv-text-primary tracking-tight">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-nv-text-secondary mt-2">
            {isRegister
              ? 'Join NoVoice and start connecting'
              : 'Sign in to continue to NoVoice'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <AnimatePresence mode="wait">
            {isRegister && (
              <motion.div
                key="register-fields"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3 overflow-hidden"
              >
                <input
                  type="text"
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => updateForm('username', e.target.value)}
                  className="nv-input"
                  required={isRegister}
                  autoComplete="username"
                />
                <input
                  type="text"
                  placeholder="Display Name (optional)"
                  value={form.displayName}
                  onChange={(e) => updateForm('displayName', e.target.value)}
                  className="nv-input"
                  autoComplete="name"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateForm('email', e.target.value)}
            className="nv-input"
            required
            autoComplete="email"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              className="nv-input pr-12"
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nv-text-tertiary hover:text-nv-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-nv-danger text-xs font-medium px-1"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl bg-nv-accent text-white font-semibold text-sm
              hover:bg-nv-accent-hover transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
              shadow-lg shadow-nv-accent/20 hover:shadow-nv-accent/30
              mt-5"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                {isRegister ? 'Create Account' : 'Sign In'}
                <ArrowRight size={16} />
              </>
            )}
          </motion.button>
        </form>

        {/* Toggle */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-sm text-nv-text-secondary hover:text-nv-text-primary transition-colors"
          >
            {isRegister ? (
              <>
                Already have an account?{' '}
                <span className="text-nv-accent font-medium">Sign In</span>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <span className="text-nv-accent font-medium">Create One</span>
              </>
            )}
          </button>
        </div>

      </motion.div>
    </div>
  );
}
