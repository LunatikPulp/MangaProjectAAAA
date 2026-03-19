import React, { useState } from 'react';
import ReportsTab from '../../components/admin/ReportsTab';
import EditSuggestionsTab from '../../components/admin/EditSuggestionsTab';
import { useReports } from '../../hooks/useReports';
import { useEditSuggestions } from '../../hooks/useEditSuggestions';

type ModeratorTab = 'reports' | 'suggestions';

const ModeratorDashboardPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ModeratorTab>('reports');
    
    const { reports } = useReports();
    const { suggestions } = useEditSuggestions();

    const pendingReportsCount = reports.filter(r => r.status === 'pending').length;
    const pendingSuggestionsCount = suggestions.filter(s => s.status === 'pending').length;

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Панель Модератора</h1>
                <p className="text-muted mt-1">Здесь вы можете управлять жалобами и правками от пользователей.</p>
            </div>
            
             <div className="border-b border-surface mb-6">
                <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
                    <TabButton name="reports" count={pendingReportsCount} activeTab={activeTab} setActiveTab={setActiveTab} highlight={pendingReportsCount > 0}>Жалобы</TabButton>
                    <TabButton name="suggestions" count={pendingSuggestionsCount} activeTab={activeTab} setActiveTab={setActiveTab} highlight={pendingSuggestionsCount > 0}>Правки</TabButton>
                </div>
            </div>

            <div>
                {activeTab === 'reports' && <ReportsTab />}
                {activeTab === 'suggestions' && <EditSuggestionsTab />}
            </div>
        </div>
    );
};

const TabButton: React.FC<{ name: ModeratorTab; count: number; activeTab: ModeratorTab; setActiveTab: (name: ModeratorTab) => void; children: React.ReactNode; highlight?: boolean }> = 
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
            <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${isActive ? 'bg-brand text-white' : 'bg-surface text-text-secondary'} ${highlight ? 'bg-brand-accent text-white' : ''}`}>
                {count}
            </span>
        </button>
    );
};

export default ModeratorDashboardPage;
