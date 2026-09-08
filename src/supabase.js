import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ycnxzuqnofgjaxyeijvm.supabase.co'
const supabaseKey = 'sb_publishable_Q1JyJ3JEHaEKYyUPDTSHvg_NLv5k0IO'

export const supabase = createClient(supabaseUrl, supabaseKey)
