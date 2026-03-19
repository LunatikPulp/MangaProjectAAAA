import { useCallback, useEffect, useState } from 'react';
import { User } from '../types';
import { API_BASE } from '../services/externalApiService';

function getToken() {
    return localStorage.getItem('backend_token');
}

export const useUsers = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.map((u: any) => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    role: u.role,
                    status: u.status,
                    avatar: u.avatar_url || u.username,
                    avatar_url: u.avatar_url || '',
                })));
            }
        } catch (e) {
            console.error('Failed to fetch users', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const updateUserStatus = useCallback(async (email: string, newStatus: 'active' | 'banned') => {
        const token = getToken();
        const user = users.find(u => u.email === email);
        if (!user?.id || !token) return;
        try {
            const res = await fetch(`${API_BASE}/admin/users/${user.id}/status`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.email === email ? { ...u, status: newStatus } : u));
            }
        } catch (e) {
            console.error('Failed to update user status', e);
        }
    }, [users]);

    const updateUserRole = useCallback(async (email: string, role: User['role']) => {
        const token = getToken();
        const user = users.find(u => u.email === email);
        if (!user?.id || !token) return;
        try {
            const res = await fetch(`${API_BASE}/admin/users/${user.id}/role`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.email === email ? { ...u, role } : u));
            }
        } catch (e) {
            console.error('Failed to update user role', e);
        }
    }, [users]);

    return { users, loading, updateUserStatus, updateUserRole, refetch: fetchUsers };
};
