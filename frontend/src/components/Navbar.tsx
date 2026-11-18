import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueue } from '../context/QueueContext';
import { Volume2, VolumeX, LogOut, LogIn, Download } from 'lucide-react';
import { InstallDialog } from './InstallDialog';

export const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { isConnected, isAudioEnabled, enableAudio, settings } = useQueue();
  const location = useLocation();
  const [isInstallOpen, setIsInstallOpen] = useState(false);

  // Hide completely on the TV display and in the small counter pop-up window
  if (location.pathname === '/display' || location.pathname.endsWith('/mini')) {
    return null;
  }

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';

  // Determine current station label based strictly on current URL
  let stationLabel = '';
  if (location.pathname.startsWith('/counter/1')) {
    stationLabel = 'Counter 1 · Regular';
  } else if (location.pathname.startsWith('/counter/2')) {
    stationLabel = 'Counter 2 · Priority';
  } else if (location.pathname.startsWith('/counter/3')) {
    stationLabel = 'Counter 3 · Request / Complaint';
  } else if (location.pathname.startsWith('/counter')) {
    stationLabel = 'Counter Workstation';
  } else if (location.pathname.startsWith('/guard')) {
    stationLabel = 'Guard Station';
  } else if (location.pathname.startsWith('/admin')) {
    stationLabel = 'Administration';
  } else if (location.pathname.startsWith('/login')) {
    stationLabel = 'Staff Sign In';
  } else {
    stationLabel = 'Queue Management System';
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="h-1 bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Office Name & Specific Station Title */}
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="PANELCO III logo"
              className="w-9 h-9 rounded-full object-contain shrink-0 ring-1 ring-slate-200"
            />
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900 leading-tight truncate">
                {officeName}
              </span>
              <span className="block text-xs text-slate-500 truncate">{stationLabel}</span>
            </div>
          </Link>

          {/* Right Status Controls (Audio, Connection, Account) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Connection Indicator */}
            <div
              className={`badge ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                  : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
              }`}
              title={isConnected ? 'Connected to Queue Server' : 'Reconnecting to Server...'}
            >
              <span className="relative flex w-2 h-2">
                {isConnected && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                )}
                <span
                  className={`relative inline-flex w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
              </span>
              <span className="hidden sm:inline">{isConnected ? 'Connected' : 'Reconnecting'}</span>
            </div>

            {/* Audio Toggle */}
            <button
              onClick={enableAudio}
              title={isAudioEnabled ? 'Mute Chime & Speech' : 'Enable Chime & Speech'}
              className="btn btn-ghost p-2"
            >
              {isAudioEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {/* Add to home screen / desktop */}
            <button
              onClick={() => setIsInstallOpen(true)}
              title="Add this to your home screen or desktop"
              className="btn btn-ghost btn-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Install</span>
            </button>

            {!isAuthenticated && location.pathname !== '/login' && (
              <Link
                to="/login"
                state={{ from: location.pathname }}
                className="btn btn-secondary btn-sm"
                title="Sign in to this station"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign in</span>
              </Link>
            )}

            {isAuthenticated && user && (
              <div className="flex items-center gap-3 pl-2 sm:pl-3 ml-1 border-l border-slate-200">
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-medium text-slate-900 leading-tight">{user.full_name}</div>
                  <div className="text-xs text-slate-500 capitalize">{user.role.toLowerCase()}</div>
                </div>
                <button onClick={logout} title="Sign out" className="btn btn-ghost p-2">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <InstallDialog isOpen={isInstallOpen} onClose={() => setIsInstallOpen(false)} />
    </header>
  );
};
