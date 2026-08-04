const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const code = '64xbat29';
  const { data: tools } = await supabase.from('tools').select('*');
  if (!tools) return console.log('No tools found');

  const tool = tools.find(t => String(t.id).includes(code) || String(t.code).includes(code) || String(t.name).includes(code));
  if (!tool) {
    console.log('Tool not found specifically. Will fix ALL tools.');
    for (const t of tools) {
       const { data: cautelas } = await supabase.from('cautelas').select('*').eq('tool_id', t.id);
       let curCaut = 0; let curLoan = 0;
       if (cautelas) {
         for (const c of cautelas) {
           if (c.status !== 'returned' && c.status !== 'completed') {
             if (c.type === 'loan') curLoan++;
             else curCaut++;
           }
         }
       }
       if (curCaut !== t.cautela_quantity || curLoan !== t.borrowed_quantity) {
          console.log(`Fixing ${t.id} - caut: ${t.cautela_quantity} -> ${curCaut}`);
          await supabase.from('tools').update({
             cautela_quantity: Math.max(0, curCaut),
             borrowed_quantity: Math.max(0, curLoan)
          }).eq('id', t.id);
       }
    }
    return;
  }
  
  console.log("Analyzing tool:", tool.id, tool.name);

    const { data: cautelas } = await supabase.from('cautelas').select('*').eq('tool_id', tool.id);
    let cautionQty = 0;
    let loanQty = 0;
    
    if (cautelas) {
      for (const c of cautelas) {
         if (c.status !== 'returned' && c.status !== 'completed') {
           if (c.type === 'loan') {
              loanQty++;
           } else {
              cautionQty++;
           }
         }
      }
    }
    
    // Check active transactions directly
    const { data: trans } = await supabase.from('transactions').select('*').eq('tool_id', tool.id).eq('status', 'active');
    let cautionCount = 0;
    let loanCount = 0;
    if (trans) {
       for (const t of trans) {
         if (t.type === 'caution') cautionCount++;
         if (t.type === 'loan' || t.type === 'borrow') loanCount++;
       }
    }
    
    const finalCautionCount = Math.max(cautionQty, cautionCount);
    const finalLoanCount = Math.max(loanQty, loanCount);
    
    console.log(`Updating tool ${tool.id}: old caut=${tool.cautela_quantity}, new caut=${finalCautionCount}, old loan=${tool.borrowed_quantity}, new loan=${finalLoanCount}`);
       
    await supabase.from('tools').update({
       cautela_quantity: finalCautionCount,
       borrowed_quantity: finalLoanCount,
       quantity_available: Math.max(0, (tool.quantity_available || 1) - finalCautionCount)
    }).eq('id', tool.id);
}
run();
