import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const Route=createFileRoute('/api/public/hooks/game-reminders')({server:{handlers:{POST:async({request})=>{
  const token=request.headers.get('x-reminder-token');
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:'not_configured'},{status:503});
  if(!token||token.length!==72) return Response.json({error:'Unauthorized'},{status:401});
  const publicClient=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>{const headers=new Headers(init?.headers);if(key.startsWith('sb_'))headers.delete('Authorization');headers.set('apikey',key);return fetch(input,{...init,headers});}}});
  const {data:valid,error}=await publicClient.rpc('verify_game_reminder_token',{_token:token});
  if(error||!valid) return Response.json({error:'Unauthorized'},{status:401});
  let body;
  try{body=z.object({dryRun:z.boolean().optional()}).strict().parse(await request.json());}catch{return Response.json({error:'invalid_body'},{status:400});}
  try{
    const {runGameReminders}=await import('@/lib/game-reminders.server');
    return Response.json({ok:true,...await runGameReminders(Date.now(),body.dryRun??false)});
  }catch(error){console.error('[game-reminders] failed',error);return Response.json({ok:false,error:'reminder_processing_failed'},{status:500});}
}}}});
