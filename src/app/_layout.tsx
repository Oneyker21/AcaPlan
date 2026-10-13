import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

void SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, profile, role, loading, profileError, retryProfile, signOut, passwordRecovery } = useAuth();

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar style="auto" />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (session && !role && !passwordRecovery) {
    return (
      <View style={styles.centered}>
        <StatusBar style="auto" />
        <Text style={styles.errorTitle}>No se pudo validar su cuenta</Text>
        <Text style={styles.errorMessage}>{profileError ?? 'Intente de nuevo o cierre sesión.'}</Text>
        <TouchableOpacity style={styles.button} onPress={() => void retryProfile()}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutButton} onPress={() => void signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (session && role && role !== 'administrador' && role !== 'docente' && role !== 'planificacion' && role !== 'coordinacion' && role !== 'jefatura' && !passwordRecovery) {
    const roleName = {
      coordinacion: 'Coordinación',
      jefatura: 'Jefatura de departamento',
      planificacion: 'Planificación',
      administrador: 'Administración',
      docente: 'Docencia',
    }[role];

    return (
      <View style={styles.centered}>
        <StatusBar style="auto" />
        <Text style={styles.errorTitle}>Hola, {profile?.nombre ?? 'bienvenido'}</Text>
        <Text style={styles.roleLabel}>{roleName}</Text>
        <Text style={styles.errorMessage}>
          Su cuenta está habilitada. El espacio de trabajo de este perfil se incorporará en los próximos sprints.
        </Text>
        <TouchableOpacity style={styles.signOutButton} onPress={() => void signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session || passwordRecovery}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && role === 'administrador' && !passwordRecovery}>
          <Stack.Screen name="(admin)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && role === 'docente' && !passwordRecovery}>
          <Stack.Screen name="(docente)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && role === 'planificacion' && !passwordRecovery}>
          <Stack.Screen name="(planificacion)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && role === 'coordinacion' && !passwordRecovery}>
          <Stack.Screen name="(coordinacion)" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session) && role === 'jefatura' && !passwordRecovery}>
          <Stack.Screen name="(jefatura)" />
        </Stack.Protected>
      </Stack>
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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  errorTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  errorMessage: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  roleLabel: {
    color: Colors.primary,
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xl,
  },
  buttonText: {
    color: Colors.white,
    fontSize: Typography.sizes.md,
    fontWeight: '600',
  },
  signOutButton: {
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  signOutText: {
    color: Colors.textLink,
    fontSize: Typography.sizes.md,
    fontWeight: '600',
  },
});
