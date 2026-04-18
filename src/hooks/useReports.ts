import { useCallback, useContext, useState } from 'react';
import { Report } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../services/externalApiService';

export const useReports = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const { user } = useContext(AuthContext);

    const fetchReports = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/reports`, {
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (e) {
            console.error('Failed to fetch reports', e);
        }
    }, []);

    const addReport = useCallback(async ({ mangaId, mangaTitle, reason, message }: { mangaId: string; mangaTitle: string; reason?: string; message?: string; }) => {
        if (!user) return;
        try {
            await fetch(`${API_BASE}/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ manga_id: mangaId, manga_title: mangaTitle, reason: reason || '', message: message || '' }),
            });
        } catch (e) {
            console.error('Failed to create report', e);
        }
    }, [user]);

    const resolveReport = useCallback(async (reportId: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/reports/${reportId}/resolve`, {
                method: 'PUT',
                credentials: 'include',
            });
            if (res.ok) {
                setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'resolved' } : r));
            }
        } catch (e) {
            console.error('Failed to resolve report', e);
        }
    }, []);

    return { reports, addReport, resolveReport, fetchReports };
};
