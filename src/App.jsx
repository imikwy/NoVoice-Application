import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { AppProvider } from './context/AppContext';
import { VoiceProvider } from './context/VoiceContext';
import TitleBar from './components/TitleBar';
import Login from './pages/Login';
import Home from './pages/Home';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown UI error' };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex-1 flex items-center justify-center bg-black px-6">
        <div className="max-w-xl w-full rounded-xl border border-nv-danger/40 bg-nv-danger/10 p-5">
          <h2 className="text-nv-text-primary font-semibold mb-2">A UI error occurred</h2>
          <p className="text-sm text-nv-text-secondary break-words">
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 nv-button-primary"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          <span className="text-nv-text-secondary text-sm font-medium tracking-wide">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col bg-black">
        <TitleBar />
        <Login />
      </div>
    );
  }

  return (
    <SocketProvider>
      <AppProvider>
        <VoiceProvider>
          <div className="h-screen w-screen flex flex-col bg-black overflow-hidden">
            <TitleBar />
            <AppErrorBoundary>
              <Home />
            </AppErrorBoundary>
          </div>
        </VoiceProvider>
      </AppProvider>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
