import { supabase } from '@/lib/supabase';
import { UserRol, Usuario } from '@/types/database';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface AuthContextType {
    session: Session | null;
    profile: Usuario | null;
    role: UserRol | null;
    loading: boolean;
    profileError: string | null;
    passwordRecovery: boolean;
    signIn: (correo: string, contrasena: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    resetPassword: (correo: string) => Promise<{ error: string | null }>;
    completePasswordRecovery: (password: string) => Promise<{ error: string | null }>;
    retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    profile: null,
    role: null,
    loading: true,
    profileError: null,
    passwordRecovery: false,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    resetPassword: async () => ({ error: null }),
    completePasswordRecovery: async () => ({ error: null }),
    retryProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function authRedirectParams(url: string) {
    const [withoutFragment, fragment = ''] = url.split('#', 2);
    const query = withoutFragment.split('?').slice(1).join('?');
    return new URLSearchParams(`${query}&${fragment}`);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Usuario | null>(null);
    const [role, setRole] = useState<UserRol | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [passwordRecovery, setPasswordRecovery] = useState(false);

    const loadProfile = useCallback(async (authUserId: string) => {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id_usuario, nombre, correo, cedula, rol, estado')
            .eq('auth_user_id', authUserId)
            .eq('estado', 'activo')
            .maybeSingle();

        return { profile: data as Usuario | null, error };
    }, []);

    const processRecoveryUrl = useCallback(async (url: string) => {
        const params = authRedirectParams(url);
        const path = Linking.parse(url).path?.replace(/^\/+/, '');
        const isRecoveryLink = params.get('type') === 'recovery' || path === 'reset-password';
        if (!isRecoveryLink) return;

        const code = params.get('code');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (!code && !(accessToken && refreshToken)) return;
        setPasswordRecovery(true);

        let error: Error | null = null;
        if (code) {
            ({ error } = await supabase.auth.exchangeCodeForSession(code));
        } else if (accessToken && refreshToken) {
            ({ error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            }));
        } else {
            return;
        }

        setPasswordRecovery(!error);
    }, []);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            setSession(nextSession);
            if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
            if (event === 'SIGNED_OUT') setPasswordRecovery(false);
        });

        void supabase.auth.getSession().then(({ data, error }) => {
            if (error) setProfileError('No se pudo recuperar la sesión. Intente de nuevo.');
            setSession(data.session);
            setAuthReady(true);
        }).catch(() => {
            setProfileError('No se pudo recuperar la sesión. Intente de nuevo.');
            setAuthReady(true);
        });

        const urlSubscription = Linking.addEventListener('url', ({ url }) => {
            void processRecoveryUrl(url);
        });

        void Linking.getInitialURL().then((url) => {
            if (url) return processRecoveryUrl(url);
            return undefined;
        }).catch(() => undefined);

        return () => {
            subscription.unsubscribe();
            urlSubscription.remove();
        };
    }, [processRecoveryUrl]);

    const refreshProfile = useCallback(async (authUserId: string) => {
        setProfileLoading(true);
        setProfileError(null);
        const { profile: nextProfile, error } = await loadProfile(authUserId);

        if (error) {
            setProfile(null);
            setRole(null);
            setProfileError('No se pudo validar su cuenta. Revise la conexión e intente de nuevo.');
        } else if (!nextProfile) {
            setProfile(null);
            setRole(null);
            setProfileError('La cuenta no está habilitada para usar AcaPlan.');
            await supabase.auth.signOut({ scope: 'local' });
        } else {
            setProfile(nextProfile);
            setRole(nextProfile.rol);
        }

        setProfileLoading(false);
    }, [loadProfile]);

    useEffect(() => {
        if (!authReady) return;
        if (!session?.user.id) {
            setProfile(null);
            setRole(null);
            setProfileError(null);
            setProfileLoading(false);
            return;
        }

        let current = true;
        setProfileLoading(true);
        setProfileError(null);
        void loadProfile(session.user.id).then(async ({ profile: nextProfile, error }) => {
            if (!current) return;
            if (error) {
                setProfile(null);
                setRole(null);
                setProfileError('No se pudo validar su cuenta. Revise la conexión e intente de nuevo.');
            } else if (!nextProfile) {
                setProfile(null);
                setRole(null);
                setProfileError('La cuenta no está habilitada para usar AcaPlan.');
                await supabase.auth.signOut({ scope: 'local' });
            } else {
                setProfile(nextProfile);
                setRole(nextProfile.rol);
            }
            setProfileLoading(false);
        }).catch(() => {
            if (!current) return;
            setProfile(null);
            setRole(null);
            setProfileError('No se pudo validar su cuenta. Revise la conexión e intente de nuevo.');
            setProfileLoading(false);
        });

        return () => { current = false; };
    }, [authReady, loadProfile, session?.user.id]);

    const signIn = useCallback(async (correo: string, contrasena: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: correo.trim(),
                password: contrasena,
            });

            if (error || !data.user) {
                return { error: 'Credenciales inválidas o cuenta no encontrada.' };
            }

            const { profile: nextProfile, error: profileFetchError } = await loadProfile(data.user.id);
            if (profileFetchError || !nextProfile) {
                await supabase.auth.signOut({ scope: 'local' });
                return { error: 'Su cuenta no está activa como personal autorizado.' };
            }

            setProfile(nextProfile);
            setRole(nextProfile.rol);
            setProfileError(null);
            return { error: null };
        } catch {
            return { error: 'Error de conexión. Intente de nuevo.' };
        }
    }, [loadProfile]);

    const signOut = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) await supabase.auth.signOut({ scope: 'local' });
        } catch {
            try {
                await supabase.auth.signOut({ scope: 'local' });
            } catch {
                // Clear in-memory access even if the local storage adapter fails.
            }
        } finally {
            setSession(null);
            setProfile(null);
            setRole(null);
            setPasswordRecovery(false);
        }
    }, []);

    const resetPassword = useCallback(async (correo: string) => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
                redirectTo: Linking.createURL('reset-password'),
            });
            return error
                ? { error: 'No se pudo enviar el correo. Intente de nuevo.' }
                : { error: null };
        } catch {
            return { error: 'Error de conexión. Intente de nuevo.' };
        }
    }, []);

    const completePasswordRecovery = useCallback(async (password: string) => {
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) return { error: 'No se pudo actualizar la contraseña. Intente de nuevo.' };

            setPasswordRecovery(false);
            await supabase.auth.signOut({ scope: 'local' });
            return { error: null };
        } catch {
            return { error: 'Error de conexión. Intente de nuevo.' };
        }
    }, []);

    const retryProfile = useCallback(async () => {
        if (session?.user.id) await refreshProfile(session.user.id);
    }, [refreshProfile, session?.user.id]);

    const value = useMemo(() => ({
        session,
        profile,
        role,
        loading: !authReady || profileLoading,
        profileError,
        passwordRecovery,
        signIn,
        signOut,
        resetPassword,
        completePasswordRecovery,
        retryProfile,
    }), [authReady, completePasswordRecovery, passwordRecovery, profile, profileError, profileLoading, resetPassword, retryProfile, role, session, signIn, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
