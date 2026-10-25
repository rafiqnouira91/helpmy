import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from '../router';
import { supabase } from '../integrations/supabase/client';
import '../styles.css';

async function start() {
  // Let Supabase consume an email-confirmation token before hash routing reads it.
  await supabase.auth.getSession();
  const element = document.getElementById('root');
  if (!element) throw new Error('Appens rotelement saknas.');
  createRoot(element).render(<RouterProvider router={getRouter()} />);
}

void start().catch(() => {
  const element = document.getElementById('root');
  if (element) element.textContent = 'Helpy kunde inte startas. Kontrollera anslutningen och försök ladda om sidan.';
});
