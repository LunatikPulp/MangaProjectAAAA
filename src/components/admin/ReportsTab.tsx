import React from 'react';
import { Link } from 'react-router-dom';
import { useReports } from '../../hooks/useReports';

const ReportsTab: React.FC = () => {
    const { reports, resolveReport } = useReports();
    const pendingReports = reports.filter(r => r.status === 'pending');

    if (pendingReports.length === 0) {
        return <div className="text-center p-8 bg-surface rounded-lg">
            <h3 className="text-xl font-bold">Нет активных жалоб</h3>
            <p className="text-muted mt-2">Все чисто!</p>
        </div>
    }

    return (
        <div className="bg-surface rounded-lg overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-overlay">
                    <tr>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Название</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Отправитель</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Дата</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Действия</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-overlay">
                    {pendingReports.map(report => (
                        <tr key={report.id} className="hover:bg-overlay transition-colors">
                            <td className="p-4 font-medium text-text-primary">
                                <Link to={`/manga/${report.mangaId}`} className="hover:text-brand" target="_blank" rel="noopener noreferrer">
                                    {report.mangaTitle}
                                </Link>
                            </td>
                            <td className="p-4 text-text-secondary">{report.reportedBy}</td>
                            <td className="p-4 text-text-secondary">
                                {new Date(report.timestamp).toLocaleString('ru-RU')}
                            </td>
                            <td className="p-4">
                                <button 
                                    onClick={() => resolveReport(report.id)}
                                    className="text-sm bg-base hover:bg-brand-10 text-brand-accent font-semibold py-1 px-3 rounded-md transition-colors"
                                >
                                    Пометить как решенную
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ReportsTab;
