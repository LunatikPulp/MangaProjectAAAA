import React, { useEffect, useState } from 'react';
import { API_BASE } from '../services/externalApiService';

const GoogleCallbackPage: React.FC = () => {
    const [status, setStatus] = useState('Авторизация через Google...');

    useEffect(() => {
        const handle = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            if (!code) {
                setStatus('Ошибка: код авторизации не найден');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/auth/google/callback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('backend_token', data.access_token);
                    // Очищаем ?code= из URL и переходим на главную
                    window.location.href = window.location.origin + window.location.pathname + '#/';
                } else {
                    const err = await res.json().catch(() => ({}));
                    setStatus(`Ошибка: ${err.detail || 'Не удалось авторизоваться'}`);
                }
            } catch {
                setStatus('Ошибка сети');
            }
        };
        handle();
    }, []);

    return (
        <div className="min-h-screen bg-base flex items-center justify-center">
            <div className="bg-surface p-8 rounded-2xl border border-overlay text-center">
                <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-text-primary">{status}</p>
            </div>
        </div>
    );
};

export default GoogleCallbackPage;
