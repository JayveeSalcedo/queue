import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueue } from '../context/QueueContext';
import { Volume2, VolumeX, Wifi, WifiOff, LogOut, LogIn } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { isConnected, isAudioEnabled, enableAudio, settings } = useQueue();
  const location = useLocation();

  // Hide completely on TV Public Display
  if (location.pathname === '/display') {
    return null;
  }

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';

  // Determine current station label based strictly on current URL
  let stationLabel = '';
  if (location.pathname.startsWith('/counter/1')) {
    stationLabel = 'COUNTER 1 • REGULAR';
  } else if (location.pathname.startsWith('/counter/2')) {
    stationLabel = 'COUNTER 2 • PRIORITY';
  } else if (location.pathname.startsWith('/counter/3')) {
    stationLabel = 'COUNTER 3 • REQUEST / COMPLAINT';
  } else if (location.pathname.startsWith('/counter')) {
    stationLabel = 'COUNTER WORKSTATION';
  } else if (location.pathname.startsWith('/guard')) {
    stationLabel = 'GUARD STATION';
  } else if (location.pathname.startsWith('/admin')) {
    stationLabel = 'ADMIN DASHBOARD';
  } else if (location.pathname.startsWith('/login')) {
    stationLabel = 'STAFF LOGIN';
  } else {
    stationLabel = 'LOCAL QUEUE SYSTEM';
  }

  return (
    <header className="bg-emerald-900 border-b-4 border-amber-400 text-white shadow-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Office Name & Specific Station Title */}
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="PANELCO III logo"
              className="w-10 h-10 rounded-full bg-white object-contain p-0.5 shadow-md shrink-0"
            />
            <div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white block leading-tight">
                {officeName}
              </span>
              <span className="text-xs text-amber-300 font-black tracking-wider uppercase block">
                {stationLabel}
              </span>
            </div>
          </div>

          {/* Right Status Controls (Audio, Connection, Logout) - No links to other screens */}
          <div className="flex items-center space-x-3">
            {/* Audio Toggle */}
            <button
              onClick={enableAudio}
              title={isAudioEnabled ? 'Mute Chime & Speech' : 'Enable Chime & Speech'}
              className={`p-2 rounded-xl transition-colors ${
                isAudioEnabled
                  ? 'bg-emerald-800 text-amber-300 hover:bg-emerald-700'
                  : 'bg-emerald-950 text-slate-400 hover:bg-emerald-900'
              }`}
            >
              {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Connection Indicator */}
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                isConnected
                  ? 'bg-emerald-800/80 text-emerald-200 border border-emerald-600'
                  : 'bg-red-950 text-red-300 border border-red-700 animate-pulse'
              }`}
              title={isConnected ? 'Connected to Queue Server' : 'Reconnecting to Server...'}
            >
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 ml-1" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>

            {/* User Info & Logout */}
            {!isAuthenticated && location.pathname !== '/login' && (
              <Link
                to="/login"
                state={{ from: location.pathname }}
                className="flex items-center space-x-1.5 pl-2 ml-1 border-l border-emerald-800 text-amber-300 hover:text-white font-bold text-xs"
                title="Sign in to this station"
              >
                <span className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 transition-colors">
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </span>
              </Link>
            )}

            {isAuthenticated && user && (
              <div className="flex items-center space-x-2 pl-2 border-l border-emerald-800">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-bold text-white leading-none">{user.full_name}</div>
                  <div className="text-[10px] text-amber-300 font-semibold">{user.role}</div>
                </div>
                <button
                  onClick={logout}
                  title="Logout"
                  className="p-1.5 rounded-xl bg-emerald-800 text-emerald-200 hover:bg-red-800 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
