import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, role, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      // Not authenticated → go to login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (role) {
      // Authenticated with role → redirect to correct dashboard
      if (inAuthGroup) {
        if (role === 'administrador') {
          router.replace('/(admin)');
        } else {
          router.replace('/(docente)');
        }
      }
    }

    SplashScreen.hideAsync();
  }, [session, role, loading, segments]);

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
