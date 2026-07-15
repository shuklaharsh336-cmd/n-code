import React from 'react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error('App crashed:', error, info);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-8 text-center text-white">
          <div className="space-y-6">
            <h1 className="text-4xl">😕</h1>
            <h2 className="text-xl font-black uppercase">
              Kuch Toot Gaya
            </h2>
            <p className="text-gray-400 text-sm">
              App mein kuch problem aa gayi.
              Data safe hai.
            </p>
            <button
              onClick={() => {
                (this as any).setState({ hasError: false });
                window.location.reload();
              }}
              className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-black uppercase transition-all"
            >
              Dobara Load Karo
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default ErrorBoundary;
