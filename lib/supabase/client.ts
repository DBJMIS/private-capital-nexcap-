/**
 * Supabase browser client for Client Components only.
 *
 * - Auth/session only (identity). Do not resolve tenant_id here; use server
 *   loaders/actions and pass tenant-scoped props from the server.
 *
 * File path: lib/supabase/client.ts
 */

'use client';

export { createBrowserClient } from '@/lib/supabase/server';
