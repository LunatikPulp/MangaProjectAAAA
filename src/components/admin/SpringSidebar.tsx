import React, { useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

// SVG Icons
const IconHome = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconArchive = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8v13H3V8M1 3h22v5H1z" />
    <path d="M10 12h4" />
  </svg>
);

const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconBox = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconNetwork = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="14" y="2" width="8" height="8" rx="1" />
    <rect x="2" y="14" width="8" height="8" rx="1" />
    <rect x="14" y="14" width="8" height="8" rx="1" />
    <path d="M10 6h4M6 10v4M18 10v4M10 18h4" />
  </svg>
);

const IconChevron = ({ expanded }: { expanded: boolean }) => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ 
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', 
      transition: 'transform 0.2s ease',
      flexShrink: 0
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconExit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconCircle = ({ active }: { active?: boolean }) => (
  <span 
    style={{ 
      width: '6px', 
      height: '6px', 
      borderRadius: '50%', 
      background: active ? '#7ab45a' : '#5a5040',
      boxShadow: active ? '0 0 6px #7ab45a' : 'none',
      display: 'inline-block',
      flexShrink: 0
    }} 
  />
);

interface NavChild {
  label: string;
  path: string;
  roles?: string[];
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  camera?: string;
  children?: NavChild[];
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    label: 'Главная',
    path: '/admin',
    icon: <IconHome />,
    camera: 'MAIN',
  },
  {
    label: 'Архивы',
    path: '/admin/archive',
    icon: <IconArchive />,
    camera: 'CAM_01',
    children: [
      { label: 'Каталог манги', path: '/admin/archive' },
      { label: 'Новая манга', path: '/admin/archives/manga/new', roles: ['admin'] },
    ],
  },
  {
    label: 'Персонал',
    path: '/admin/night-staff',
    icon: <IconUsers />,
    camera: 'CAM_02',
    children: [
      { label: 'Пользователи', path: '/admin/night-staff/users', roles: ['admin'] },
      { label: 'Жалобы', path: '/admin/night-staff/reports' },
      { label: 'Правки', path: '/admin/night-staff/suggestions' },
    ],
  },
  {
    label: 'Запчасти',
    path: '/admin/workshop',
    icon: <IconBox />,
    camera: 'CAM_03',
    roles: ['admin'],
    children: [
      { label: 'Магазин', path: '/admin/workshop/shop' },
      { label: 'Промокоды', path: '/admin/workshop/promocodes' },
      { label: 'Монетизация', path: '/admin/workshop/monetization' },
      { label: 'Транзакции', path: '/admin/workshop/transactions' },
    ],
  },
  {
    label: 'Сеть',
    path: '/admin/network',
    icon: <IconNetwork />,
    camera: 'NET',
    children: [
      { label: 'Парсер', path: '/admin/network/parser', roles: ['admin'] },
      { label: 'Аналитика', path: '/admin/network/analytics' },
      { label: 'Модерация', path: '/admin/network/moderation' },
      { label: 'Медиа', path: '/admin/network/media', roles: ['admin'] },
      { label: 'Безопасность', path: '/admin/network/security', roles: ['admin'] },
      { label: 'Уведомления', path: '/admin/network/notifications', roles: ['admin'] },
      { label: 'Аудит', path: '/admin/network/audit', roles: ['admin'] },
      { label: 'Настройки', path: '/admin/network/settings', roles: ['admin'] },
    ],
  },
];

const SpringSidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const userRole = user?.role || 'user';

  const filterByRole = <T extends { roles?: string[] }>(items: T[]): T[] =>
    items.filter(item => !item.roles || item.roles.includes(userRole));

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    navItems.forEach(item => {
      if (item.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'))) {
        init.add(item.label);
      }
    });
    return init;
  });

  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = filterByRole(navItems);

  const toggle = (label: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isParentActive = (item: NavItem) => {
    if (item.path === '/admin' && location.pathname === '/admin') return true;
    return item.children?.some(c => isActive(c.path)) ?? false;
  };

  const currentTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <aside
      className={`h-screen flex flex-col transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
      style={{
        background: 'linear-gradient(180deg, #1a1714 0%, #141210 100%)',
        borderRight: '1px solid #2a2620',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-5"
        style={{ borderBottom: '1px solid #2a2620' }}
      >
        {!collapsed && (
          <div className="min-w-0">
            <div 
              className="font-mono text-lg font-bold tracking-wider truncate flex items-center gap-2"
              style={{ color: '#c4b454' }}
            >
              <span style={{ 
                width: '8px', 
                height: '8px', 
                background: '#c4b454', 
                borderRadius: '50%',
                boxShadow: '0 0 8px rgba(196, 180, 84, 0.5)'
              }} />
              AFTON
            </div>
            <div 
              className="font-mono text-xs mt-1 truncate"
              style={{ color: '#7a7570' }}
            >
              Панель управления
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all hover:bg-white/5"
          style={{
            border: '1px solid #35302a',
            background: '#1e1a16',
            color: '#8a8078',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* System Status Bar */}
      {!collapsed && (
        <div
          className="font-mono text-xs px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid #2a2620', background: 'rgba(0, 0, 0, 0.2)' }}
        >
          <span className="flex items-center gap-2">
            <span style={{ color: '#5a5040' }}>●</span>
            <span style={{ color: '#7a7570' }}>SYS</span>
            <span style={{ color: '#7ab45a' }}>ONLINE</span>
          </span>
          <span style={{ color: '#7a7570' }}>{currentTime}</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto springos-scroll">
        {visibleItems.map(item => {
          const active = isParentActive(item);
          const isExpanded = expanded.has(item.label);
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.label} className="mb-1 px-3">
              {/* Parent Item */}
              {hasChildren ? (
                <button
                  onClick={() => toggle(item.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all duration-200 group"
                  style={{
                    background: active ? 'rgba(196, 180, 84, 0.08)' : 'transparent',
                    borderLeft: active ? '2px solid #c4b454' : '2px solid transparent',
                    color: active ? '#c4b454' : '#b8b0a8',
                  }}
                >
                  <span className="flex-shrink-0 opacity-80 group-hover:opacity-100">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm block truncate font-medium">
                          {item.label}
                        </span>
                        {item.camera && (
                          <span 
                            className="font-mono text-xs mt-0.5 block"
                            style={{ color: active ? '#8a8050' : '#5a5040' }}
                          >
                            [{item.camera}]
                          </span>
                        )}
                      </div>
                      <IconChevron expanded={isExpanded} />
                    </>
                  )}
                </button>
              ) : (
                <Link
                  to={item.path}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 group"
                  style={{
                    background: active ? 'rgba(196, 180, 84, 0.08)' : 'transparent',
                    borderLeft: active ? '2px solid #c4b454' : '2px solid transparent',
                    color: active ? '#c4b454' : '#b8b0a8',
                    textDecoration: 'none',
                  }}
                >
                  <span className="flex-shrink-0 opacity-80 group-hover:opacity-100">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm block truncate font-medium">
                        {item.label}
                      </span>
                      {item.camera && (
                        <span 
                          className="font-mono text-xs mt-0.5 block"
                          style={{ color: active ? '#8a8050' : '#5a5040' }}
                        >
                          [{item.camera}]
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              )}

              {/* Children */}
              {!collapsed && hasChildren && isExpanded && (
                <div
                  className="ml-4 pl-3 mt-1 space-y-0.5"
                  style={{ borderLeft: '1px solid #2a2620' }}
                >
                  {filterByRole(item.children!).map(child => {
                    const childActive = isActive(child.path);
                    return (
                      <Link
                        key={child.path}
                        to={child.path}
                        className="flex items-center gap-3 py-2 px-2 rounded transition-all duration-150 group text-sm"
                        style={{
                          color: childActive ? '#e8e0d8' : '#7a7570',
                          background: childActive ? 'rgba(196, 180, 84, 0.05)' : 'transparent',
                          borderLeft: childActive ? '2px solid #7ab45a' : '2px solid transparent',
                          textDecoration: 'none',
                          marginLeft: '-1px',
                        }}
                      >
                        <IconCircle active={childActive} />
                        <span className="truncate font-mono group-hover:text-b8b0a8">
                          {child.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Exit to site */}
      <div 
        className="px-3 py-3" 
        style={{ borderTop: '1px solid #2a2620', background: 'rgba(0,0,0,0.2)' }}
      >
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group"
          style={{ color: '#8a8078', textDecoration: 'none' }}
        >
          <span className="flex-shrink-0 opacity-60 group-hover:opacity-100">
            <IconExit />
          </span>
          {!collapsed && (
            <span className="font-mono text-sm group-hover:text-b8b0a8">
              На сайт
            </span>
          )}
        </Link>
      </div>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid #2a2620' }}>
        {!collapsed ? (
          <div className="font-mono text-xs">
            <div className="flex items-center justify-between mb-1">
              <span style={{ color: '#5a5040' }}>v4.0</span>
              <span 
                className="w-2 h-2 rounded-full inline-block"
                style={{
                  background: '#7ab45a',
                  boxShadow: '0 0 6px rgba(90, 138, 58, 0.5)',
                }}
              />
            </div>
            <div style={{ color: '#3a3028', fontSize: '10px' }}>
              AFTON ROBOTICS LLC
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <span 
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background: '#7ab45a',
                boxShadow: '0 0 6px rgba(90, 138, 58, 0.5)',
              }}
            />
          </div>
        )}
      </div>
    </aside>
  );
};

export default SpringSidebar;