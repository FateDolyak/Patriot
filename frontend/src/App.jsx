import { Routes, Route, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import ChallengesPage from './pages/ChallengesPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';

function Header() {
  const { user, signOut } = useAuth();
  return (
    <header className="site-header">
      <div className="brand">
        <span className="flag">🇺🇸</span>
        <div>
          <div className="brand-title">The Freedom Trail</div>
          <div className="brand-sub">4th of July Challenge</div>
        </div>
      </div>
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Challenges
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          Leaderboard
        </NavLink>
        {user && (
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
            Profile
          </NavLink>
        )}
        {user && (
          <button className="link-btn signout" onClick={signOut}>
            Sign out
          </button>
        )}
      </nav>
    </header>
  );
}

function Shell() {
  return (
    <div className="app">
      <Header />
      <main className="content">
        <Routes>
          <Route path="/" element={<ChallengesPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        Let freedom ring. Complete every challenge to finish the Trail.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
