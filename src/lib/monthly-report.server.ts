// Gera relatório mensal em PDF e envia por e-mail aos administradores.
// SERVER-ONLY: never import this file from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const REPORT_RECIPIENTS = [
  "guilherme@wernerwalter.com.br",
  "bimbs87@gmail.com",
];

const SITE_URL = "https://rankmymatch.app";

async function ensureAppAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data) throw new Error("Forbidden: not an app admin");
}

// ===== Tipos =====
export interface MonthlyReportData {
  periodLabel: string; // "Outubro/2025"
  periodStart: string; // ISO
  periodEnd: string; // ISO
  generatedAt: string;
  // Tráfego do mês completo
  month: {
    sessions: number;
    pageviews: number;
    newVisitors: number;
    signups: number;
    visitToSignupPct: number;
    bounceRate: number;
  };
  // Janelas comparativas
  last7d: WindowStats;
  last30d: WindowStats;
  // Top
  topUtmSources: Array<{ key: string; sessions: number; signups: number; rate: number }>;
  topReferrers: Array<{ key: string; sessions: number; signups: number; rate: number }>;
  topLandings: Array<{ path: string; sessions: number; bouncePct: number }>;
}

interface WindowStats {
  sessions: number;
  pageviews: number;
  newVisitors: number;
  signups: number;
  conversionPct: number;
}

// ===== Helpers de data =====
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
}
function previousMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ===== Coleta de dados =====
async function fetchVisitsBetween(startISO: string, endISO: string) {
  // Pagina 1000 por vez (limite default Supabase)
  const all: Array<{
    session_id: string;
    path: string;
    is_first_visit: boolean;
    user_id: string | null;
    utm_source: string | null;
    referrer_host: string | null;
    created_at: string;
  }> = [];
  let from = 0;
  const PAGE = 1000;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabaseAdmin
      .from("page_visits")
      .select("session_id,path,is_first_visit,user_id,utm_source,referrer_host,created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function computeWindowStats(
  visits: Awaited<ReturnType<typeof fetchVisitsBetween>>,
  signupsCount: number
): WindowStats {
  const sessions = new Set(visits.map((v) => v.session_id)).size;
  const newVisitors = visits.filter((v) => v.is_first_visit).length;
  const conversionPct = sessions > 0 ? (signupsCount / sessions) * 100 : 0;
  return {
    sessions,
    pageviews: visits.length,
    newVisitors,
    signups: signupsCount,
    conversionPct,
  };
}

async function countSignupsBetween(startISO: string, endISO: string): Promise<number> {
  // auth.users via admin API — pagina e filtra por created_at
  let total = 0;
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      const t = new Date(u.created_at).getTime();
      if (t >= new Date(startISO).getTime() && t < new Date(endISO).getTime()) {
        total += 1;
      }
    }
    if (users.length < perPage) break;
  }
  return total;
}

function topByKey(
  visits: Awaited<ReturnType<typeof fetchVisitsBetween>>,
  keyFn: (v: (typeof visits)[number]) => string | null,
  signupSessionIds: Set<string>,
  limit = 10
) {
  const bySession = new Map<string, { key: string; userId: string | null }>();
  for (const v of visits) {
    if (!bySession.has(v.session_id)) {
      const k = keyFn(v) ?? "(direto)";
      bySession.set(v.session_id, { key: k, userId: v.user_id });
    }
  }
  const stats = new Map<string, { sessions: number; signups: number }>();
  for (const [sid, info] of bySession) {
    const cur = stats.get(info.key) ?? { sessions: 0, signups: 0 };
    cur.sessions += 1;
    if (signupSessionIds.has(sid)) cur.signups += 1;
    stats.set(info.key, cur);
  }
  return Array.from(stats.entries())
    .map(([key, s]) => ({
      key,
      sessions: s.sessions,
      signups: s.signups,
      rate: s.sessions > 0 ? (s.signups / s.sessions) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

function topLandings(
  visits: Awaited<ReturnType<typeof fetchVisitsBetween>>,
  limit = 10
) {
  // Agrupa por session: primeira página visitada e total de pageviews
  const bySession = new Map<string, { landing: string; pageviews: number }>();
  const sortedVisits = [...visits].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const v of sortedVisits) {
    const cur = bySession.get(v.session_id);
    if (!cur) {
      bySession.set(v.session_id, { landing: v.path, pageviews: 1 });
    } else {
      cur.pageviews += 1;
    }
  }
  const stats = new Map<string, { sessions: number; bounces: number }>();
  for (const info of bySession.values()) {
    const cur = stats.get(info.landing) ?? { sessions: 0, bounces: 0 };
    cur.sessions += 1;
    if (info.pageviews === 1) cur.bounces += 1;
    stats.set(info.landing, cur);
  }
  return Array.from(stats.entries())
    .map(([path, s]) => ({
      path,
      sessions: s.sessions,
      bouncePct: s.sessions > 0 ? (s.bounces / s.sessions) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

async function buildReportData(targetMonth: Date): Promise<MonthlyReportData> {
  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);
  const now = new Date();
  const last7Start = new Date(now.getTime() - 7 * 86400_000);
  const last30Start = new Date(now.getTime() - 30 * 86400_000);

  const [monthVisits, last7Visits, last30Visits, signupsMonth, signups7, signups30] =
    await Promise.all([
      fetchVisitsBetween(monthStart.toISOString(), monthEnd.toISOString()),
      fetchVisitsBetween(last7Start.toISOString(), now.toISOString()),
      fetchVisitsBetween(last30Start.toISOString(), now.toISOString()),
      countSignupsBetween(monthStart.toISOString(), monthEnd.toISOString()),
      countSignupsBetween(last7Start.toISOString(), now.toISOString()),
      countSignupsBetween(last30Start.toISOString(), now.toISOString()),
    ]);

  // signupSessionIds = sessões cujo user_id existe e foi criado dentro do mês
  // Aproximação: qualquer sessão com user_id != null durante o mês
  const monthSignupSessionIds = new Set(
    monthVisits.filter((v) => v.user_id).map((v) => v.session_id)
  );

  // Bounce rate
  const sessionPageviews = new Map<string, number>();
  for (const v of monthVisits) {
    sessionPageviews.set(v.session_id, (sessionPageviews.get(v.session_id) ?? 0) + 1);
  }
  const totalSessions = sessionPageviews.size;
  const bouncedSessions = Array.from(sessionPageviews.values()).filter((n) => n === 1).length;
  const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

  const month = {
    sessions: totalSessions,
    pageviews: monthVisits.length,
    newVisitors: monthVisits.filter((v) => v.is_first_visit).length,
    signups: signupsMonth,
    visitToSignupPct: totalSessions > 0 ? (signupsMonth / totalSessions) * 100 : 0,
    bounceRate,
  };

  return {
    periodLabel: fmtMonthLabel(targetMonth),
    periodStart: monthStart.toISOString(),
    periodEnd: monthEnd.toISOString(),
    generatedAt: now.toISOString(),
    month,
    last7d: computeWindowStats(last7Visits, signups7),
    last30d: computeWindowStats(last30Visits, signups30),
    topUtmSources: topByKey(monthVisits, (v) => v.utm_source, monthSignupSessionIds, 10),
    topReferrers: topByKey(monthVisits, (v) => v.referrer_host, monthSignupSessionIds, 10),
    topLandings: topLandings(monthVisits, 10),
  };
}

// ===== Geração de PDF (pdf-lib) =====
async function generatePdf(d: MonthlyReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const carbon = rgb(0.06, 0.08, 0.1);
  const rally = rgb(0.64, 0.9, 0.21);
  const text = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.45);

  let page = pdfDoc.addPage([595, 842]); // A4 portrait
  const margin = 48;
  let y = 842 - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([595, 842]);
      y = 842 - margin;
    }
  };

  // pdf-lib's StandardFonts (WinAnsi) cannot encode many unicode chars
  // (→, ·, …, –, —, etc). Replace them with ASCII-safe equivalents.
  const sanitize = (s: string) =>
    String(s ?? "")
      .replace(/→/g, "->")
      .replace(/←/g, "<-")
      .replace(/↑/g, "^")
      .replace(/↓/g, "v")
      .replace(/[·•]/g, "-")
      .replace(/…/g, "...")
      .replace(/[–—]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // strip any remaining non-WinAnsi (latin1) chars
      .replace(/[^\x00-\xFF]/g, "?");

  const safeDraw = (
    str: string,
    opts: Parameters<typeof page.drawText>[1],
  ) => page.drawText(sanitize(str), opts);

  const drawText = (
    str: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    page.drawText(sanitize(str), {
      x: opts.x ?? margin,
      y,
      size,
      font: f,
      color: opts.color ?? text,
    });
  };

  // Header band
  page.drawRectangle({ x: 0, y: 842 - 80, width: 595, height: 80, color: carbon });
  page.drawText("RankMyMatch", {
    x: margin,
    y: 842 - 38,
    size: 20,
    font: fontBold,
    color: rally,
  });
  page.drawText("Relatório mensal de tráfego e conversão", {
    x: margin,
    y: 842 - 60,
    size: 11,
    font,
    color: rgb(0.7, 0.72, 0.75),
  });
  y = 842 - 110;

  drawText(`Período: ${d.periodLabel}`, { size: 14, bold: true });
  y -= 18;
  drawText(`Gerado em ${new Date(d.generatedAt).toLocaleString("pt-BR")}`, {
    size: 9,
    color: muted,
  });
  y -= 28;

  // Section helper
  const section = (title: string) => {
    newPageIfNeeded(40);
    drawText(title, { size: 13, bold: true, color: carbon });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: 595 - margin, y },
      thickness: 1,
      color: rally,
    });
    y -= 16;
  };

  const kv = (label: string, value: string) => {
    newPageIfNeeded(16);
    drawText(label, { size: 10, color: muted });
    page.drawText(value, {
      x: 595 - margin - font.widthOfTextAtSize(value, 10),
      y,
      size: 10,
      font: fontBold,
      color: text,
    });
    y -= 16;
  };

  // === Mês completo
  section(`Tráfego do mês (${d.periodLabel})`);
  kv("Sessões", d.month.sessions.toLocaleString("pt-BR"));
  kv("Pageviews", d.month.pageviews.toLocaleString("pt-BR"));
  kv("Novos visitantes", d.month.newVisitors.toLocaleString("pt-BR"));
  kv("Cadastros", d.month.signups.toLocaleString("pt-BR"));
  kv("Conversão visitante → cadastro", `${d.month.visitToSignupPct.toFixed(2)}%`);
  kv("Bounce rate", `${d.month.bounceRate.toFixed(1)}%`);
  y -= 12;

  // === 7d
  section("Últimos 7 dias");
  kv("Sessões", d.last7d.sessions.toLocaleString("pt-BR"));
  kv("Pageviews", d.last7d.pageviews.toLocaleString("pt-BR"));
  kv("Novos visitantes", d.last7d.newVisitors.toLocaleString("pt-BR"));
  kv("Cadastros", d.last7d.signups.toLocaleString("pt-BR"));
  kv("Conversão", `${d.last7d.conversionPct.toFixed(2)}%`);
  y -= 12;

  // === 30d
  section("Últimos 30 dias");
  kv("Sessões", d.last30d.sessions.toLocaleString("pt-BR"));
  kv("Pageviews", d.last30d.pageviews.toLocaleString("pt-BR"));
  kv("Novos visitantes", d.last30d.newVisitors.toLocaleString("pt-BR"));
  kv("Cadastros", d.last30d.signups.toLocaleString("pt-BR"));
  kv("Conversão", `${d.last30d.conversionPct.toFixed(2)}%`);
  y -= 12;

  // === Tabelas
  const drawTableHeader = (cols: string[], widths: number[]) => {
    newPageIfNeeded(20);
    let x = margin;
    cols.forEach((c, i) => {
      page.drawText(c, { x, y, size: 9, font: fontBold, color: muted });
      x += widths[i];
    });
    y -= 12;
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: 595 - margin, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
  };
  const drawTableRow = (cells: string[], widths: number[]) => {
    newPageIfNeeded(14);
    let x = margin;
    cells.forEach((c, i) => {
      const maxChars = Math.floor(widths[i] / 5.2);
      const truncated = c.length > maxChars ? c.slice(0, maxChars - 1) + "…" : c;
      page.drawText(truncated, { x, y, size: 9, font, color: text });
      x += widths[i];
    });
    y -= 13;
  };

  section("Top UTM sources do mês");
  if (d.topUtmSources.length === 0) {
    drawText("Sem dados.", { size: 10, color: muted });
    y -= 16;
  } else {
    drawTableHeader(["Origem", "Sessões", "Cadastros", "Conversão"], [260, 80, 90, 70]);
    d.topUtmSources.forEach((r) =>
      drawTableRow(
        [r.key, String(r.sessions), String(r.signups), `${r.rate.toFixed(2)}%`],
        [260, 80, 90, 70]
      )
    );
  }
  y -= 12;

  section("Top referrers do mês");
  if (d.topReferrers.length === 0) {
    drawText("Sem dados.", { size: 10, color: muted });
    y -= 16;
  } else {
    drawTableHeader(["Referrer", "Sessões", "Cadastros", "Conversão"], [260, 80, 90, 70]);
    d.topReferrers.forEach((r) =>
      drawTableRow(
        [r.key, String(r.sessions), String(r.signups), `${r.rate.toFixed(2)}%`],
        [260, 80, 90, 70]
      )
    );
  }
  y -= 12;

  section("Top landing pages do mês");
  if (d.topLandings.length === 0) {
    drawText("Sem dados.", { size: 10, color: muted });
    y -= 16;
  } else {
    drawTableHeader(["Página", "Sessões", "Bounce rate"], [340, 80, 80]);
    d.topLandings.forEach((r) =>
      drawTableRow(
        [r.path, String(r.sessions), `${r.bouncePct.toFixed(1)}%`],
        [340, 80, 80]
      )
    );
  }

  // Footer em todas as páginas
  const total = pdfDoc.getPageCount();
  for (let i = 0; i < total; i++) {
    const p = pdfDoc.getPage(i);
    p.drawText(`RankMyMatch · ${d.periodLabel} · página ${i + 1}/${total}`, {
      x: margin,
      y: 24,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  return pdfDoc.save();
}

// ===== Upload + signed URL =====
async function uploadPdfAndSign(
  pdfBytes: Uint8Array,
  fileName: string
): Promise<{ path: string; signedUrl: string }> {
  const path = `${new Date().getUTCFullYear()}/${fileName}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("monthly-reports")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
  // 90 dias
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("monthly-reports")
    .createSignedUrl(path, 60 * 60 * 24 * 90);
  if (signErr || !signed) throw new Error(`Signed URL falhou: ${signErr?.message}`);
  return { path, signedUrl: signed.signedUrl };
}

// ===== Envio de e-mail =====
async function enqueueReportEmail(
  recipient: string,
  payload: {
    periodLabel: string;
    downloadUrl: string;
    summary: MonthlyReportData;
    idempotencySuffix: string;
  }
): Promise<void> {
  // Reutiliza o pgmq enfileirando direto via RPC (evita HTTP loopback).
  // Consumido pelo dispatcher process-email-queue.
  const messageId = crypto.randomUUID();
  const idempotencyKey = `monthly-report-${payload.idempotencySuffix}-${recipient}`;
  const { error } = await supabaseAdmin.rpc("enqueue_email" as never, {
    queue_name: "transactional_emails",
    payload: {
      template_name: "monthly-report",
      recipient_email: recipient,
      message_id: messageId,
      idempotency_key: idempotencyKey,
      template_data: {
        periodLabel: payload.periodLabel,
        downloadUrl: payload.downloadUrl,
        summary: payload.summary,
      },
    } as never,
  } as never);
  if (error) throw new Error(`Falha ao enfileirar e-mail: ${error.message}`);
}

// ===== Função principal (compartilhada) =====
async function runMonthlyReport(targetMonth: Date) {
  const data = await buildReportData(targetMonth);
  const pdfBytes = await generatePdf(data);
  const monthSlug = `${targetMonth.getUTCFullYear()}-${String(
    targetMonth.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  const fileName = `rankmymatch-${monthSlug}.pdf`;
  const { path, signedUrl } = await uploadPdfAndSign(pdfBytes, fileName);

  for (const recipient of REPORT_RECIPIENTS) {
    await enqueueReportEmail(recipient, {
      periodLabel: data.periodLabel,
      downloadUrl: signedUrl,
      summary: data,
      idempotencySuffix: monthSlug,
    });
  }

  return {
    periodLabel: data.periodLabel,
    pdfPath: path,
    downloadUrl: signedUrl,
    recipients: REPORT_RECIPIENTS,
    summary: data,
  };
}

// Helpers exportados para wrappers (server functions / rotas de cron)
export async function runMonthlyReportForMode(
  mode: "current" | "previous" | undefined
) {
  const target =
    mode === "current" ? startOfMonth(new Date()) : previousMonth(new Date());
  return runMonthlyReport(target);
}

export async function runScheduledMonthlyReport() {
  // Cron roda dia 1 — relata o MÊS ANTERIOR
  const target = previousMonth(new Date());
  return runMonthlyReport(target);
}

export { ensureAppAdmin, SITE_URL };
