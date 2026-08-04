require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const toolId = '64xbat29'; // Wait, let's fix ALL tools just in case
  const { data: tools } = await supabase.from('tools').select('*');
  if (!tools) return console.log('No tools found');

  for (const tool of tools) {
    // Check how many users have this tool caution
    const { data: cautelas } = await supabase.from('cautelas').select('*').eq('tool_id', tool.id);
    let cautionQty = 0;
    let loanQty = 0;
    
    if (cautelas) {
      for (const c of cautelas) {
         if (c.type === 'loan') {
            loanQty++;
         } else {
            cautionQty++; // Includes undefined or 'caution'
         }
      }
    }
    
    // Also check transactions in case they are generated there
    const { data: activeTrans } = await supabase.from('transactions').select('*').eq('tool_id', tool.id).eq('status', 'active');
    let cautionCount = 0;
    let loanCount = 0;
    if (activeTrans) {
      cautionCount = activeTrans.filter(t => t.type === 'caution').length;
      loanCount = activeTrans.filter(t => t.type === 'loan' || t.type === 'borrow').length;
    }
    
    // We should use cautelas count or transactions? The app code uses `cautelas` for big tools, but wait! The fix button uses `transactions` table!
    const finalCautionCount = Math.max(cautionQty, cautionCount);
    const finalLoanCount = Math.max(loanQty, loanCount);
    
    if (tool.cautela_quantity !== finalCautionCount || tool.borrowed_quantity !== finalLoanCount) {
       console.log(`Updating tool ${tool.id}: old caut=${tool.cautela_quantity}, new caut=${finalCautionCount}, old loan=${tool.borrowed_quantity}, new loan=${finalLoanCount}`);
       // And recalculate quantity_available? 
       // Just set cautela_quantity
       await supabase.from('tools').update({
         cautela_quantity: finalCautionCount,
         borrowed_quantity: Math.max(0, finalLoanCount) // If it was 0, it shouldn't go negative
       }).eq('id', tool.id);
    }
  }
}

run();
