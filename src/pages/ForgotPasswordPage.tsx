import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/externalApiService';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Ошибка');
      }
    } catch {
      setError('Ошибка сети');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="border border-overlay bg-surface p-8">
          <h1 className="font-mono text-xl font-bold text-brand-accent mb-1 tracking-wider">СБРОС ПАРОЛЯ</h1>
          <p className="font-mono text-xs text-muted mb-6">SpringManga — восстановление доступа</p>

          {sent ? (
            <div className="space-y-4">
              <div className="p-4 border border-brand-accent/20 bg-brand-accent/5">
                <p className="font-mono text-sm text-text-primary">Письмо отправлено на <span className="text-brand-accent">{email}</span></p>
                <p className="font-mono text-xs text-muted mt-2">Проверьте почту и перейдите по ссылке. Если письма нет — проверьте спам.</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 font-mono font-bold bg-overlay text-text-primary hover:bg-surface-hover transition-colors"
              >
                НА ГЛАВНУЮ
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono font-semibold text-muted block mb-1">Email аккаунта</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                />
              </div>
              {error && <p className="text-xs text-brand-accent">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-2.5 font-mono font-bold text-black bg-brand-accent hover:bg-brand-hover hover:text-white disabled:opacity-50 transition-all"
              >
                {loading ? 'ОТПРАВКА...' : 'ОТПРАВИТЬ ССЫЛКУ'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2 text-xs font-mono text-muted hover:text-brand-accent transition-colors"
              >
                ← Назад
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
