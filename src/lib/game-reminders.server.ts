import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendPushToUserIds } from './web-push.server';
import { DAY, gameTime, localDate, presenceOpening, reminderKinds, type ReminderKind } from './game-reminder-rules';

export async function runGameReminders(now = Date.now(), dryRun = false) {
  const { data: rounds, error } = await supabaseAdmin.from('rounds').select('id,group_id,season_id,scheduled_date,scheduled_time,status,round_number,presence_force_open_at,groups(name,presence_open_mode,presence_open_time)')
    .in('status', ['scheduled','in_progress']).gte('scheduled_date',localDate(now-30*DAY)).lte('scheduled_date',localDate(now+3*DAY));
  if (error) throw error;
  let planned=0, sent=0, failed=0;
  for (const round of rounds || []) {
    if (!round.scheduled_date || !round.groups) continue;
    const group = round.groups;
    const start = gameTime(round.scheduled_date,round.scheduled_time);
    const open = presenceOpening(round.scheduled_date,round.scheduled_time,round.id,group.presence_open_mode,group.presence_open_time,round.presence_force_open_at);
    const [membersResult,presenceResult,matchesResult] = await Promise.all([
      supabaseAdmin.from('group_members').select('user_id,role').eq('group_id',round.group_id).eq('status','active'),
      supabaseAdmin.from('round_presence').select('user_id,status').eq('round_id',round.id),
      supabaseAdmin.from('matches').select('id,status,match_players(user_id)').eq('round_id',round.id),
    ]);
    if (membersResult.error || presenceResult.error || matchesResult.error) throw membersResult.error || presenceResult.error || matchesResult.error;
    const matches=matchesResult.data || [];
    // Completed/not-played matches are resolved, even if the round status is stale.
    if (matches.length && matches.every(m=>['completed','not_played','cancelled'].includes(m.status))) continue;
    const members=membersResult.data || [];
    const userIds=members.map(m=>m.user_id);
    if (!userIds.length) continue;
    const [visitsResult,prefsResult] = await Promise.all([
      supabaseAdmin.from('page_visits').select('user_id').in('user_id',userIds).gte('created_at',new Date(start).toISOString()).limit(10000),
      supabaseAdmin.from('push_notification_preferences').select('user_id,event_type,enabled').in('user_id',userIds),
    ]);
    if (visitsResult.error || prefsResult.error) throw visitsResult.error || prefsResult.error;
    const visitors=new Set((visitsResult.data||[]).map(v=>v.user_id));
    const optedOut=new Set((prefsResult.data||[]).filter(p=>!p.enabled).map(p=>`${p.user_id}:${p.event_type}`));
    const dateLabel = new Date(start).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'});
    const timeLabel = (round.scheduled_time||'00:00').slice(0,5);
    const nextRound=(rounds||[]).filter(r=>r.group_id===round.group_id && r.scheduled_date && gameTime(r.scheduled_date,r.scheduled_time)>start && r.scheduled_date===localDate(now))
      .sort((a,b)=>gameTime(a.scheduled_date||'',a.scheduled_time)-gameTime(b.scheduled_date||'',b.scheduled_time))[0];
    for (const member of members) {
      const admin=['admin','creator'].includes(member.role);
      const presence=presenceResult.data?.find(p=>p.user_id===member.user_id);
      const involved=matches.some(m=>m.match_players.some(p=>p.user_id===member.user_id)) || presence?.status==='confirmed';
      let kinds=reminderKinds(now,start,open,visitors.has(member.user_id));
      kinds=kinds.filter(kind=>kind.startsWith('result_') ? (admin||involved) && presence?.status!=='cancelled' : !presence || (admin && presence.status!=='cancelled'));
      if (nextRound && (admin||involved) && !visitors.has(member.user_id) && presence?.status!=='cancelled') kinds.push('previous_round_pending');
      // At most one presence message per user/run; newer reminders replace older catch-up messages.
      const presenceKinds=kinds.filter(k=>['round_open','presence_day_before','round_urgent'].includes(k));
      if(presenceKinds.length>1) kinds=kinds.filter(k=>!presenceKinds.includes(k)||k===presenceKinds[presenceKinds.length-1]);
      for (const kind of kinds) {
        if(optedOut.has(`${member.user_id}:${kind}`)) continue;
        planned++;
        if(dryRun) continue;
        const {data:claimed,error:claimError}=await supabaseAdmin.rpc('claim_round_reminder',{_round_id:round.id,_user_id:member.user_id,_event_type:kind});
        if(claimError) throw claimError;
        if(!claimed) continue;
        const title=kind.startsWith('result_')?'Falta registrar o resultado':kind==='previous_round_pending'?'Uma rodada ficou pendente':kind==='round_open'?'Lista de presença aberta':'Seu próximo jogo está chegando';
        const body=kind==='previous_round_pending'
          ? `${group.name}: a rodada de ${dateLabel} continua pendente. ${admin?'Quer cancelá-la? Revise a rodada anterior e confirme a lista do jogo de hoje.':'Peça ao admin para revisar a rodada anterior e confirme sua presença no jogo de hoje.'}`
          : kind.startsWith('result_') ? `${group.name}: o jogo de ${dateLabel}, às ${timeLabel}, ainda está sem resultado. Abra a rodada para registrar os placares.`
          : `${group.name}: jogo em ${dateLabel}, às ${timeLabel}. ${admin?'Confirme presença e organize a lista de jogadores.':'Confirme sua presença na lista.'}`;
        const url=`/groups/${round.group_id}?view=seasons${round.season_id?`&season=${round.season_id}`:''}&round=${round.id}`;
        const data={groupId:round.group_id,seasonId:round.season_id,roundId:round.id,url,nextRoundId:kind==='previous_round_pending'?nextRound?.id:undefined};
        const result=await sendPushToUserIds([member.user_id],{title,body,type:kind,tag:`${kind}:${round.id}`,url,data});
        const success=result.sent>0;
        const {error:logError}=await supabaseAdmin.from('round_reminder_deliveries').update({status:success?'sent':'failed',delivered_at:success?new Date(now).toISOString():null,last_error:result.error||(!success?'no_delivery':null)}).eq('round_id',round.id).eq('user_id',member.user_id).eq('event_type',kind);
        if(logError) throw logError;
        if(success){sent+=result.sent; const {error:notificationError}=await supabaseAdmin.from('notifications').insert({user_id:member.user_id,group_id:round.group_id,type:kind,title,body,data});if(notificationError) console.error('[game-reminders] notification insert failed',notificationError);}else failed++;
      }
    }
  }
  return {planned,sent,failed,dryRun};
}
