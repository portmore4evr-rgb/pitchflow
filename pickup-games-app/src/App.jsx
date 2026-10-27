import { Link, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Host from './pages/Host.jsx';
import Admin from './pages/Admin.jsx';
import Logo from './components/Logo.jsx';

export const BRAND = 'PitchFlow';

export default function App() {
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand">
          <Logo size={30} />
          <span>{BRAND}</span>
        </Link>
        <Link to="/host" className="navlink">Host a game</Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<Host />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<p className="card">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
