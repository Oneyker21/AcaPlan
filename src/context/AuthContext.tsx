import { supabase } from '@/lib/supabase';
import { UserRol, Usuario } from '@/types/database';
import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
    session: Session | null;
    profile: Usuario | null;
    role: UserRol | null;
    loading: boolean;
    signIn: (correo: string, contrasena: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    resetPassword: (correo: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    profile: null,
    role: null,
    loading: true,
    signIn: async () => ({ error: null }),
    signOut: async () => { },
    resetPassword: async () => ({ error: null }),
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Usuario | null>(null);
    const [role, setRole] = useState<UserRol | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user profile from the `usuarios` table
    const fetchProfile = async (email: string) => {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('correo', email)
            .eq('estado', 'activo')
            .single();

        if (error || !data) {
            setProfile(null);
            setRole(null);
            return;
        }

        setProfile(data as Usuario);
        setRole(data.rol as UserRol);
    };

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user?.email) {
                fetchProfile(session.user.email).finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session);
                if (session?.user?.email) {
                    await fetchProfile(session.user.email);
                } else {
                    setProfile(null);
                    setRole(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (correo: string, contrasena: string) => {
        try {
            // Authenticate with Supabase Auth FIRST
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: correo,
                password: contrasena,
            });

            if (authError || !authData.user) {
                return { error: 'Credenciales inválidas o cuenta no encontrada.' };
            }

            // THEN check if user exists and is active in our usuarios table
            // Now that we are authenticated, RLS policies for 'authenticated' users will apply
            const { data: userData, error: userError } = await supabase
                .from('usuarios')
                .select('estado, rol')
                .eq('correo', correo)
                .single();

            if (userError || !userData) {
                await supabase.auth.signOut();
                return { error: 'Su cuenta no ha sido registrada como personal autorizado.' };
            }

            if (userData.estado === 'inactivo') {
                await supabase.auth.signOut();
                return { error: 'Su cuenta está inactiva. Contacte al administrador.' };
            }

            return { error: null };
        } catch {
            return { error: 'Error de conexión. Intente de nuevo.' };
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setRole(null);
    };

    const resetPassword = async (correo: string) => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(correo, {
                redirectTo: 'acaplan://reset-password',
            });

            if (error) {
                return { error: 'No se pudo enviar el correo. Intente de nuevo.' };
            }

            // Generic message regardless of whether email exists (H02-CA1)
            return { error: null };
        } catch {
            return { error: 'Error de conexión. Intente de nuevo.' };
        }
    };

    return (
        <AuthContext.Provider
            value={{ session, profile, role, loading, signIn, signOut, resetPassword }}
        >
            {children}
        </AuthContext.Provider>
    );
}
