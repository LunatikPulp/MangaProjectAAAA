import React, { useContext } from 'react';
import { HashRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import HomePage from './pages/HomePage';
import DetailPage from './pages/DetailPage';
import TopsPage from './pages/TopsPage';
import BookmarksPage from './pages/BookmarksPage';
import HistoryPage from './pages/HistoryPage';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import { MangaContext } from './contexts/MangaContext';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import CreateMangaPage from './pages/admin/CreateMangaPage';
import AdminRoute from './components/AdminRoute';
import GenrePage from './pages/GenrePage';
import ReaderPage from './pages/ReaderPage';
import DetailPageSkeleton from './components/skeletons/DetailPageSkeleton';
import SuggestEditPage from './pages/SuggestEditPage';
import CatalogPage from './pages/CatalogPage';
import ModeratorDashboardPage from './pages/moderator/ModeratorDashboardPage';
import ModeratorRoute from './components/ModeratorRoute';
import ImportMangaPage from './pages/admin/ImportMangaPage';
import ManageMangaPage from './pages/admin/ManageMangaPage';
import SectionListPage from './pages/SectionListPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import UserProfilePage from './pages/UserProfilePage';
import UserBookmarksPage from './pages/UserBookmarksPage';
import MessagesPage from './pages/MessagesPage';
import QuizPage from './pages/QuizPage';
import CardsPage from './pages/CardsPage';

const DetailPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, fetchMangaById, loading } = useContext(MangaContext);
    const mangaId = id || '';
    const manga = getMangaById(mangaId);
    const [fetching, setFetching] = React.useState(false);
    const [notFound, setNotFound] = React.useState(false);

    React.useEffect(() => {
        if (!manga && !loading && !fetching && !notFound) {
            setFetching(true);
            fetchMangaById(mangaId).then(result => {
                if (!result) setNotFound(true);
                setFetching(false);
            });
        }
    }, [manga, loading, fetching, notFound, mangaId, fetchMangaById]);

    if (loading || fetching) {
        return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga && notFound) {
        return <PageTransition><div className="text-center p-8">Manga not found.</div></PageTransition>;
    }
    if (!manga) {
        return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    return <PageTransition><DetailPage manga={manga} /></PageTransition>;
};

const ManageMangaPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, loading } = useContext(MangaContext);
    const mangaId = id || '';
    const manga = getMangaById(mangaId);

    if (loading) {
         return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga) {
        return <PageTransition><div className="text-center p-8">Manga not found.</div></PageTransition>;
    }
    return <PageTransition><ManageMangaPage manga={manga} /></PageTransition>;
};

const SuggestEditPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, loading } = useContext(MangaContext);
    const mangaId = id || '';
    const manga = getMangaById(mangaId);

    if (loading) {
         return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga) {
        return <PageTransition><div className="text-center p-8">Manga not found.</div></PageTransition>;
    }
    return <PageTransition><SuggestEditPage manga={manga} /></PageTransition>;
};


const GenrePageWrapper: React.FC = () => {
    const { genreName } = useParams<{ genreName: string }>();
    return <PageTransition><GenrePage genreName={genreName || ''} /></PageTransition>;
};

const ReaderPageWrapper: React.FC = () => {
    const { id, chapterId } = useParams<{ id: string; chapterId: string; }>();
    const location = useLocation();
    const mangaId = id || '';
    const chapId = chapterId || '';
    const startPage = (location.state as any)?.startPage || 1;
    return <PageTransition><ReaderPage key={`${mangaId}-${chapId}`} mangaId={mangaId} chapterId={chapId} startPage={startPage} /></PageTransition>;
}


const AppRoutes: React.FC = () => {
  const location = useLocation();
  
  return (
     <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname.startsWith('/messages') ? '/messages' : location.pathname}>
            <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
            <Route path="/catalog" element={<PageTransition><CatalogPage /></PageTransition>} />
            <Route path="/manga/:id" element={<DetailPageWrapper />} />
            <Route path="/tops" element={<PageTransition><TopsPage /></PageTransition>} />
            <Route path="/genre/:genreName" element={<GenrePageWrapper />} />
            <Route path="/list/:section" element={<PageTransition><SectionListPage /></PageTransition>} />
            
            <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
            <Route path="/register" element={<PageTransition><RegisterPage /></PageTransition>} />
            
            {/* User Routes */}
            <Route path="/bookmarks" element={<ProtectedRoute><PageTransition><BookmarksPage /></PageTransition></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><PageTransition><HistoryPage /></PageTransition></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><PageTransition><ProfilePage /></PageTransition></ProtectedRoute>} />
            <Route path="/profile/friends" element={<ProtectedRoute><PageTransition><FriendsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/user/:userId" element={<PageTransition><UserProfilePage /></PageTransition>} />
            <Route path="/user/:userId/bookmarks" element={<PageTransition><UserBookmarksPage /></PageTransition>} />
            <Route path="/messages" element={<ProtectedRoute><PageTransition><MessagesPage /></PageTransition></ProtectedRoute>} />
            <Route path="/messages/:userId" element={<ProtectedRoute><PageTransition><MessagesPage /></PageTransition></ProtectedRoute>} />
            <Route path="/quiz" element={<PageTransition><QuizPage /></PageTransition>} />
            <Route path="/cards" element={<ProtectedRoute><PageTransition><CardsPage /></PageTransition></ProtectedRoute>} />

            <Route path="/manga/:id/chapter/:chapterId" element={<ReaderPageWrapper />} />
            <Route path="/manga/:id/suggest-edit" element={<ProtectedRoute><SuggestEditPageWrapper /></ProtectedRoute>} />

            {/* Admin & Moderator Routes */}
            <Route path="/admin" element={<AdminRoute><PageTransition><AdminDashboardPage /></PageTransition></AdminRoute>} />
            <Route path="/admin/create" element={<AdminRoute><PageTransition><CreateMangaPage /></PageTransition></AdminRoute>} />
            <Route path="/admin/import" element={<AdminRoute><PageTransition><ImportMangaPage /></PageTransition></AdminRoute>} />
            <Route path="/admin/manga/:id/manage" element={<AdminRoute><ManageMangaPageWrapper /></AdminRoute>} />
            <Route path="/manga/:id/edit" element={<AdminRoute><ManageMangaPageWrapper /></AdminRoute>} />
            <Route path="/moderator" element={<ModeratorRoute><PageTransition><ModeratorDashboardPage /></PageTransition></ModeratorRoute>} />

            <Route path="/auth/callback" element={<Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    </AnimatePresence>
  )
}

const AppContent: React.FC = () => {
  const location = useLocation();
  const isReaderPage = location.pathname.includes('/chapter/');
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/user/');
  const isMessagesPage = location.pathname.startsWith('/messages');
  
  return (
    <div className={`min-h-screen flex flex-col overflow-x-hidden ${isMessagesPage ? 'overflow-hidden' : ''} ${isProfilePage ? '' : 'bg-base'}`}>
      {!isReaderPage && <Header />}
      <main className={`${isReaderPage ? 'flex-grow' : isMessagesPage ? '' : 'flex-grow container mx-auto px-4 md:px-8 py-6 pb-20 md:pb-6'}`}>
        <AppRoutes />
      </main>
      <AuthModal />
    </div>
  );
};

const App: React.FC = () => {
  // Google OAuth redirects to http://localhost:5173?code=xxx — handle before HashRouter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code') && urlParams.has('scope')) {
    return <GoogleCallbackPage />;
  }

  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

export default App;
