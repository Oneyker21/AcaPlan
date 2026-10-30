import { supabase } from '@/lib/supabase';
import { UserRol, Usuario } from '@/types/database';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface AuthContextType {
    session: Session | null;
    profile: Usuario | null;
    role: UserRol | null;
    loading: boolean;
    profileError: string | null;
    loginError: string | null;
    passwordRecovery: boolean;
    signIn: (correo: string, contrasena: string) => Promise<{ error: string | null }>;
    clearLoginError: () => void;
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
    loginError: null,
    passwordRecovery: false,
    signIn: async () => ({ error: null }),
    clearLoginError: () => { },
    signOut: async () => { },
    resetPassword: async () => ({ error: null }),
    completePasswordRecovery: async () => ({ error: null }),
    retryProfile: async () => { },
});

export const useAuth = () => useContext(AuthContext);

function authRedirectParams(url: string) {
    const [withoutFragment, fragment = ''] = url.split('#', 2);
    const query = withoutFragment.split('?').slice(1).join('?');
    return new URLSearchParams(`${query}&${fragment}`);
}

function describeProfileError(error: { code?: string } | null | undefined) {
    if (error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST205') {
        return 'El esquema de Supabase está desactualizado. Aplique las migraciones del proyecto y vuelva a intentar.';
    }
    if (error?.code === '42501') {
        return 'Supabase bloqueó la lectura del perfil. Revise la política RLS de usuarios y el vínculo de la cuenta.';
    }
    return `No se pudo consultar el perfil en Supabase${error?.code ? ` (${error.code})` : ''}. Revise la conexión, las migraciones y las políticas de acceso.`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Usuario | null>(null);
    const [role, setRole] = useState<UserRol | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [passwordRecovery, setPasswordRecovery] = useState(false);
    const [signInPending, setSignInPending] = useState(false);
    const verifiedAuthUserId = useRef<string | null>(null);
    const authStateUpdated = useRef(false);

    const loadProfile = useCallback(async (authUserId: string) => {
        console.log('[AUTH] loadProfile → Buscando perfil para auth_user_id:', authUserId);
        const { data, error } = await supabase
            .from('usuarios')
            .select('id_usuario, nombre, correo, cedula, rol, estado')
            .eq('auth_user_id', authUserId)
            .eq('estado', 'activo')
            .maybeSingle();

        if (error) {
            console.error('[AUTH] loadProfile → ❌ Error al consultar perfil:', JSON.stringify(error));
        } else if (!data) {
            console.warn('[AUTH] loadProfile → ⚠️ No se encontró perfil activo para este auth_user_id');
        } else {
            console.log('[AUTH] loadProfile → ✅ Perfil encontrado:', data.nombre, '| Rol:', data.rol);
        }

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
        console.log('[AUTH] Inicializando listener de auth state...');
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            console.log('[AUTH] onAuthStateChange → Evento:', event, '| Sesión:', nextSession ? 'SÍ' : 'NO', nextSession ? `(user: ${nextSession.user.email})` : '');
            authStateUpdated.current = true;
            setSession(nextSession);
            setAuthReady(true);
            if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
            if (event === 'SIGNED_OUT') setPasswordRecovery(false);
        });

        void supabase.auth.getSession().then(({ data, error }) => {
            console.log('[AUTH] getSession inicial →', error ? `❌ Error: ${error.message}` : (data.session ? `✅ Sesión existente (${data.session.user.email})` : '⚪ Sin sesión'));
            // A login/logout event may arrive while this initial snapshot is pending.
            // Never let an older snapshot overwrite the newer auth state.
            if (!authStateUpdated.current) {
                if (error) setProfileError('No se pudo recuperar la sesión. Intente de nuevo.');
                setSession(data.session);
            }
            setAuthReady(true);
        }).catch((err) => {
            console.error('[AUTH] getSession inicial → ❌ Excepción:', err);
            if (!authStateUpdated.current) setProfileError('No se pudo recuperar la sesión. Intente de nuevo.');
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
            setProfileError(describeProfileError(error));
        } else if (!nextProfile) {
            setProfile(null);
            setRole(null);
            setProfileError('La cuenta no está habilitada para usar AcaPlan.');
        } else {
            setProfile(nextProfile);
            setRole(nextProfile.rol);
        }

        setProfileLoading(false);
    }, [loadProfile]);

    useEffect(() => {
        if (!authReady) return;
        if (signInPending) return;
        if (!session?.user.id) {
            verifiedAuthUserId.current = null;
            setProfile(null);
            setRole(null);
            setProfileError(null);
            setProfileLoading(false);
            return;
        }
        if (verifiedAuthUserId.current === session.user.id) return;

        let current = true;
        setProfileLoading(true);
        setProfileError(null);
        void loadProfile(session.user.id).then(async ({ profile: nextProfile, error }) => {
            if (!current) return;
            if (error) {
                setProfile(null);
                setRole(null);
                setProfileError(describeProfileError(error));
            } else if (!nextProfile) {
                setProfile(null);
                setRole(null);
                setProfileError('La cuenta no está habilitada para usar AcaPlan.');
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
    }, [authReady, loadProfile, session?.user.id, signInPending]);

    const signIn = useCallback(async (correo: string, contrasena: string) => {
        console.log('[AUTH] signIn → Intentando login con email:', correo.trim());
        setSignInPending(true);
        setProfileError(null);
        setLoginError(null);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: correo.trim(),
                password: contrasena,
            });

            if (error || !data.user || !data.session) {
                console.error('[AUTH] signIn → ❌ Supabase auth falló:', error ? `${error.message} (status: ${error.status})` : 'No user/session returned');
                const message = error
                    ? 'Credenciales inválidas o cuenta no encontrada.'
                    : 'Supabase no devolvió una sesión de acceso. Verifique la configuración de autenticación e intente de nuevo.';
                setLoginError(message);
                return { error: message };
            }
            console.log('[AUTH] signIn → ✅ Auth exitosa. User ID:', data.user.id, '| Email:', data.user.email);
            // Keep navigation in sync even if the auth event is delayed.
            authStateUpdated.current = true;
            setSession(data.session);
            setAuthReady(true);

            console.log('[AUTH] signIn → Cargando perfil del usuario...');
            const { profile: nextProfile, error: profileFetchError } = await loadProfile(data.user.id);
            if (profileFetchError) {
                console.error('[AUTH] signIn → ❌ Error al cargar perfil, cerrando sesión local:', JSON.stringify(profileFetchError));
                await supabase.auth.signOut({ scope: 'local' });
                const errorCode = profileFetchError.code;
                if (errorCode === '42703' || errorCode === 'PGRST204' || errorCode === 'PGRST205') {
                    const message = 'La base de datos de AcaPlan necesita actualizarse. Aplique las migraciones de Supabase y vuelva a intentar.';
                    setLoginError(message);
                    return { error: message };
                }
                if (errorCode === '42501') {
                    const message = describeProfileError(profileFetchError);
                    setLoginError(message);
                    return { error: message };
                }
                const message = describeProfileError(profileFetchError);
                setLoginError(message);
                return { error: message };
            }
            if (!nextProfile) {
                console.warn('[AUTH] signIn → ⚠️ Auth OK pero NO hay perfil activo en public.usuarios para auth_user_id:', data.user.id);
                setProfile(null);
                setRole(null);
                setProfileError('La autenticación fue correcta, pero no se encontró un perfil activo vinculado en public.usuarios. Revise auth_user_id y que estado sea activo; cierre sesión después de corregirlo.');
                return { error: null };
            }

            console.log('[AUTH] signIn → ✅ Login completo. Perfil:', nextProfile.nombre, '| Rol:', nextProfile.rol);
            verifiedAuthUserId.current = data.user.id;
            setProfile(nextProfile);
            setRole(nextProfile.rol);
            setProfileError(null);
            return { error: null };
        } catch (err) {
            console.error('[AUTH] signIn → ❌ Excepción inesperada:', err);
            const message = 'Error de conexión. Intente de nuevo.';
            setLoginError(message);
            return { error: message };
        } finally {
            setSignInPending(false);
        }
    }, [loadProfile]);

    const clearLoginError = useCallback(() => setLoginError(null), []);

    const signOut = useCallback(async () => {
        console.log('[AUTH] signOut → Cerrando sesión...');
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.warn('[AUTH] signOut → Error en signOut global, intentando local:', error.message);
                await supabase.auth.signOut({ scope: 'local' });
            }
            console.log('[AUTH] signOut → ✅ Sesión cerrada');
        } catch (err) {
            console.error('[AUTH] signOut → ❌ Excepción:', err);
            try {
                await supabase.auth.signOut({ scope: 'local' });
            } catch {
                // Clear in-memory access even if the local storage adapter fails.
            }
        } finally {
            verifiedAuthUserId.current = null;
            setSession(null);
            setProfile(null);
            setRole(null);
            setLoginError(null);
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
        loading: !authReady || profileLoading || signInPending
            || Boolean(session?.user.id && !profile && !profileError && !passwordRecovery),
        profileError,
        loginError,
        passwordRecovery,
        signIn,
        clearLoginError,
        signOut,
        resetPassword,
        completePasswordRecovery,
        retryProfile,
    }), [authReady, clearLoginError, completePasswordRecovery, loginError, passwordRecovery, profile, profileError, profileLoading, resetPassword, retryProfile, role, session, signIn, signInPending, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
