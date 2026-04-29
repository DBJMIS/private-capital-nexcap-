import type { DefaultSession } from 'next-auth';
import type { JWT as DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      profile_id: string | null;
      tenant_id: string | null;
      role: string | null;
      user_id: string;
      full_name: string;
      is_active: boolean;
      allowedModules?: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    profile_id?: string | null;
    tenant_id?: string | null;
    role?: string | null;
    accessToken?: string;
    user_id?: string;
    full_name?: string;
    is_active?: boolean;
    allowedModules?: string[];
  }
}
