import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../services/externalApiService';


const SpringlockWarning: React.FC = () => {
    const { user } = useContext(AuthContext);
    const [warning, setWarning] = useState<{ active: boolean; reason?: string; warnings_count?: number; dismiss_after?: number } | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!user) return;
        fetch(`${API_BASE}/auth/warning`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.active) {
                    setWarning(data);
                    setCountdown(data.dismiss_after || 5);
                }
            })
            .catch(() => {});
    }, [user]);

    useEffect(() => {
        if (!warning || dismissed) return;
        if (countdown <= 0) {
            handleDismiss();
            return;
        }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [countdown, warning, dismissed]);

    const handleDismiss = async () => {
        await fetch(`${API_BASE}/auth/warning/dismiss`, { method: 'POST', credentials: 'include' }).catch(() => {});
        setDismissed(true);
    };

    if (!warning || !warning.active || dismissed) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a0808] border-2 border-red-600/60 rounded-lg p-6 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(220,38,38,0.3)]">
                <div className="text-center space-y-4">
                    <div className="text-5xl">⚠️</div>
                    <h2 className="text-xl font-bold text-red-400 font-mono uppercase tracking-wider">
                        СПРИНГЛОК-ПРЕДУПРЕЖДЕНИЕ
                    </h2>
                    <p className="text-red-200/80 text-sm">
                        {warning.reason || 'Нарушение правил сообщества'}
                    </p>
                    <div className="bg-red-900/30 border border-red-700/40 rounded p-3">
                        <p className="text-xs font-mono text-red-300">
                            Предупреждений: <span className="text-red-400 font-bold text-lg">{warning.warnings_count}</span> / 3
                        </p>
                        <p className="text-[10px] text-red-400/60 mt-1">
                            После 3-го предупреждения — автоматический бан
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        disabled={countdown > 0}
                        className={`w-full py-2 px-4 font-mono text-sm font-bold tracking-wider transition-all ${
                            countdown > 0
                                ? 'bg-red-900/30 text-red-600/50 cursor-not-allowed border border-red-800/30'
                                : 'bg-red-700 text-white hover:bg-red-600 border border-red-500 cursor-pointer'
                        }`}
                    >
                        {countdown > 0 ? `ПОНЯЛ (${countdown}с)` : 'ПОНЯЛ'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SpringlockWarning;
