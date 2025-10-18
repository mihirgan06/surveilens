import { Link, useLocation } from 'react-router-dom';
import { MonitorPlay, Eye } from 'lucide-react';

export function TopNavigation() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-slate-900/95 border-b border-slate-700/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Eye className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              SurveiLens
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            <Link
              to="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isActive('/')
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <MonitorPlay className="h-4 w-4" />
              CCTV Dashboard
            </Link>
            <Link
              to="/detection"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isActive('/detection')
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Eye className="h-4 w-4" />
              Detection
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}