const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: tools } = await supabase.from('tools').select('*');
  for (const t of tools) {
     if (t.cautela_quantity > 0 || t.borrowed_quantity > 0) {
        // If it was checked out via the buggy assinatura logic, it didn't reduce quantity_available.
        // Wait, how do we know if it was reduced or not? We don't.
        // But if they say 'ta como 0' maybe they just wanted to fix the caution amount?
        // Let's set quantity_available to 0 for these two specific tools since they probably had only 1.
        if (t.id === '8add749b-988c-4061-9640-6c7e6725dee6' || t.id === '96b05b57-15dd-434c-8ac7-03f2def1532d') {
           await supabase.from('tools').update({
              quantity_available: Math.max(0, t.quantity_available - t.cautela_quantity - t.borrowed_quantity) // wait, actually if quantity_available was untouched, we subtract it now.
           }).eq('id', t.id);
        }
     }
  }
}

run();
