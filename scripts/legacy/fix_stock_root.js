const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const toolId = '64xbat29';
  console.log("Supabase connected. Fetching tools to fix...");
  const { data: tools } = await supabase.from('tools').select('*');
  if (!tools) return console.log('No tools found');

  for (const tool of tools) {
    if (tool.id !== toolId) continue;
    
    console.log("Analyzing tool:", tool.id);

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
    
    // Choose the maximum between transactions and cautelas tracking
    const finalCautionCount = Math.max(cautionQty, cautionCount);
    const finalLoanCount = Math.max(loanQty, loanCount);
    
    if (tool.cautela_quantity !== finalCautionCount || tool.borrowed_quantity !== finalLoanCount) {
       console.log(`Updating tool ${tool.id}: old caut=${tool.cautela_quantity}, new caut=${finalCautionCount}, old loan=${tool.borrowed_quantity}, new loan=${finalLoanCount}`);
       
       await supabase.from('tools').update({
         cautela_quantity: finalCautionCount,
         borrowed_quantity: finalLoanCount
       }).eq('id', tool.id);
    } else {
       console.log(`Tool ${tool.id} is already correct. (caut=${finalCautionCount}, loan=${finalLoanCount})`);
    }
  }
}

run();
