import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/externalApiService';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Токен сброса отсутствует. Запросите ссылку заново.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 6) {
      setError('Пароль минимум 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
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
          <h1 className="font-mono text-xl font-bold text-brand-accent mb-1 tracking-wider">НОВЫЙ ПАРОЛЬ</h1>
          <p className="font-mono text-xs text-muted mb-6">SpringManga — установка пароля</p>

          {success ? (
            <div className="space-y-4">
              <div className="p-4 border border-brand-accent/20 bg-brand-accent/5">
                <p className="font-mono text-sm text-text-primary">Пароль изменён!</p>
                <p className="font-mono text-xs text-muted mt-1">Войдите с новым паролем.</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 font-mono font-bold text-black bg-brand-accent hover:bg-brand-hover transition-colors"
              >
                НА ГЛАВНУЮ
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono font-semibold text-muted block mb-1">Новый пароль</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full px-3 py-2 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-mono font-semibold text-muted block mb-1">Повторите пароль</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  className="w-full px-3 py-2 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                />
              </div>
              {error && <p className="text-xs text-brand-accent">{error}</p>}
              <button
                type="submit"
                disabled={loading || !token}
                className="w-full py-2.5 font-mono font-bold text-black bg-brand-accent hover:bg-brand-hover hover:text-white disabled:opacity-50 transition-all"
              >
                {loading ? 'СОХРАНЕНИЕ...' : 'СМЕНИТЬ ПАРОЛЬ'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
