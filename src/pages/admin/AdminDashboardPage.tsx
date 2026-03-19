import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import UserManagementTab from '../../components/admin/UserManagementTab';
import ReportsTab from '../../components/admin/ReportsTab';
import EditSuggestionsTab from '../../components/admin/EditSuggestionsTab';
import MangaListTab from '../../components/admin/MangaListTab';
import { useReports } from '../../hooks/useReports';
import { useEditSuggestions } from '../../hooks/useEditSuggestions';
import { useUsers } from '../../hooks/useUsers';
import { MangaContext } from '../../contexts/MangaContext';

type AdminTab = 'manga' | 'users' | 'reports' | 'suggestions';

const AdminDashboardPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AdminTab>('manga');
    
    const { reports } = useReports();
    const { suggestions } = useEditSuggestions();
    const { users } = useUsers();
    const { mangaList } = useContext(MangaContext);

    const pendingReportsCount = reports.filter(r => r.status === 'pending').length;
    const pendingSuggestionsCount = suggestions.filter(s => s.status === 'pending').length;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Панель Администратора</h1>
                <Link to="/admin/create" className="bg-brand hover:bg-brand-hover text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Добавить мангу
                </Link>
            </div>
            
             <div className="border-b border-surface mb-6">
                <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
                    <TabButton name="manga" count={mangaList.length} activeTab={activeTab} setActiveTab={setActiveTab}>Манга</TabButton>
                    <TabButton name="users" count={users.length} activeTab={activeTab} setActiveTab={setActiveTab}>Пользователи</TabButton>
                    <TabButton name="reports" count={pendingReportsCount} activeTab={activeTab} setActiveTab={setActiveTab} highlight={pendingReportsCount > 0}>Жалобы</TabButton>
                    <TabButton name="suggestions" count={pendingSuggestionsCount} activeTab={activeTab} setActiveTab={setActiveTab} highlight={pendingSuggestionsCount > 0}>Правки</TabButton>
                </div>
            </div>

            <div>
                {activeTab === 'manga' && <MangaListTab />}
                {activeTab === 'users' && <UserManagementTab />}
                {activeTab === 'reports' && <ReportsTab />}
                {activeTab === 'suggestions' && <EditSuggestionsTab />}
            </div>
        </div>
    );
};

const TabButton: React.FC<{ name: AdminTab; count: number; activeTab: AdminTab; setActiveTab: (name: AdminTab) => void; children: React.ReactNode; highlight?: boolean }> = 
({ name, count, activeTab, setActiveTab, children, highlight }) => {
    const isActive = name === activeTab;
    return (
        <button
            onClick={() => setActiveTab(name)}
            className={`relative flex-shrink-0 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                isActive
                    ? 'border-brand text-text-primary'
                    : 'border-transparent text-muted hover:text-text-primary'
            }`}
        >
            {children} 
            <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-none ${isActive ? 'bg-brand text-white' : 'bg-surface text-text-secondary'} ${highlight ? 'bg-brand-accent text-white' : ''}`}>
                {count}
            </span>
        </button>
    );
};

export default AdminDashboardPage;