import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({path: './.env'})

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data: vpi } = await supabase.from('video_plan_items').select('*').limit(1)
  console.log("VPI Keys:", vpi && vpi.length > 0 ? Object.keys(vpi[0]) : "Empty table")
}
run()
