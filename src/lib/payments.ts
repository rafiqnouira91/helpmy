import { STATIC_SITE } from './deployment';
import { supabase } from '@/integrations/supabase/client';

export async function paymentAction<T = { url: string }>(action: string, jobId?: string): Promise<T> {
  if (STATIC_SITE) throw new Error('Kortbetalning är inte tillgänglig i den här versionen ännu.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Logga in först.');
  const response = await fetch(`/api/stripe/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ jobId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Betalningsåtgärden misslyckades.');
  return result as T;
}
