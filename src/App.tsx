import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Landing from '@/components/Landing';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';

const ADMIN_HASH = '#admin-access-4k';

type Route = 'home' | 'admin-login' | 'admin-dashboard';

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email === 'admin@image4k.com') {
        setRoute('admin-dashboard');
      } else if (window.location.hash === ADMIN_HASH) {
        setRoute('admin-login');
      }
      setCheckingSession(false);
    };
    checkSession();

    const handleHashChange = () => {
      if (window.location.hash === ADMIN_HASH) {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.user?.email === 'admin@image4k.com') {
            setRoute('admin-dashboard');
          } else {
            setRoute('admin-login');
          }
        });
      } else {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) {
            setRoute('home');
          }
        });
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user?.email === 'admin@image4k.com') {
          setRoute('admin-dashboard');
        } else if (!session) {
          if (route === 'admin-dashboard') {
            setRoute('home');
          }
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [route]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (route === 'admin-login') {
    return <AdminLogin onSuccess={() => setRoute('admin-dashboard')} onBack={() => { window.location.hash = ''; setRoute('home'); }} />;
  }

  if (route === 'admin-dashboard') {
    return <AdminDashboard onLogout={() => { window.location.hash = ''; setRoute('home'); }} />;
  }

  return <Landing />;
}
