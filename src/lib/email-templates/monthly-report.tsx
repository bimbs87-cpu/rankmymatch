import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface MonthlyReportProps {
  periodLabel?: string
  downloadUrl?: string
  summary?: {
    month?: {
      sessions?: number
      pageviews?: number
      newVisitors?: number
      signups?: number
      visitToSignupPct?: number
      bounceRate?: number
    }
    last7d?: { sessions?: number; signups?: number; conversionPct?: number }
    last30d?: { sessions?: number; signups?: number; conversionPct?: number }
    topUtmSources?: Array<{ key: string; sessions: number; signups: number; rate: number }>
    topReferrers?: Array<{ key: string; sessions: number; signups: number; rate: number }>
  }
}

const num = (n?: number) =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—'
const pct = (n?: number) =>
  typeof n === 'number' ? `${n.toFixed(2)}%` : '—'

const row = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid #eef0f2',
  fontSize: '14px',
}
const rowLabel = { color: '#55575d' }
const rowValue = { color: '#1a1a1a', fontWeight: 600 as const }

const MonthlyReportEmail = ({
  periodLabel,
  downloadUrl,
  summary,
}: MonthlyReportProps) => {
  const m = summary?.month ?? {}
  const w7 = summary?.last7d ?? {}
  const w30 = summary?.last30d ?? {}
  const utm = summary?.topUtmSources?.slice(0, 5) ?? []
  const ref = summary?.topReferrers?.slice(0, 5) ?? []

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        Relatório mensal {periodLabel ?? ''} · {num(m.sessions)} sessões ·{' '}
        {num(m.signups)} cadastros
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandText}>{SITE_NAME}</Text>
            <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>
              Relatório mensal — {periodLabel ?? 'período recente'}
            </Heading>
            <Text style={styles.text}>
              Aqui está o resumo de tráfego, aquisição e conversão do período. O
              PDF completo, com tabelas detalhadas de UTMs, referrers e landing
              pages, está disponível para download abaixo.
            </Text>

            {downloadUrl && (
              <Section style={styles.buttonWrap}>
                <Button style={styles.button} href={downloadUrl}>
                  Baixar relatório em PDF
                </Button>
              </Section>
            )}

            <Heading style={{ ...styles.h1, fontSize: '16px', marginTop: '8px' }}>
              Mês completo
            </Heading>
            <div style={row}>
              <span style={rowLabel}>Sessões</span>
              <span style={rowValue}>{num(m.sessions)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Pageviews</span>
              <span style={rowValue}>{num(m.pageviews)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Novos visitantes</span>
              <span style={rowValue}>{num(m.newVisitors)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Cadastros</span>
              <span style={rowValue}>{num(m.signups)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Conversão visitante → cadastro</span>
              <span style={rowValue}>{pct(m.visitToSignupPct)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Bounce rate</span>
              <span style={rowValue}>{pct(m.bounceRate)}</span>
            </div>

            <Hr style={{ borderColor: '#eef0f2', margin: '24px 0 16px' }} />

            <Heading style={{ ...styles.h1, fontSize: '16px' }}>
              Janelas comparativas
            </Heading>
            <div style={row}>
              <span style={rowLabel}>Últimos 7d — sessões</span>
              <span style={rowValue}>
                {num(w7.sessions)} ({pct(w7.conversionPct)})
              </span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Últimos 7d — cadastros</span>
              <span style={rowValue}>{num(w7.signups)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Últimos 30d — sessões</span>
              <span style={rowValue}>
                {num(w30.sessions)} ({pct(w30.conversionPct)})
              </span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Últimos 30d — cadastros</span>
              <span style={rowValue}>{num(w30.signups)}</span>
            </div>

            {utm.length > 0 && (
              <>
                <Hr style={{ borderColor: '#eef0f2', margin: '24px 0 16px' }} />
                <Heading style={{ ...styles.h1, fontSize: '16px' }}>
                  Top UTM sources
                </Heading>
                {utm.map((r) => (
                  <div key={`utm-${r.key}`} style={row}>
                    <span style={rowLabel}>{r.key}</span>
                    <span style={rowValue}>
                      {num(r.sessions)} sess · {num(r.signups)} cad ·{' '}
                      {pct(r.rate)}
                    </span>
                  </div>
                ))}
              </>
            )}

            {ref.length > 0 && (
              <>
                <Hr style={{ borderColor: '#eef0f2', margin: '24px 0 16px' }} />
                <Heading style={{ ...styles.h1, fontSize: '16px' }}>
                  Top referrers
                </Heading>
                {ref.map((r) => (
                  <div key={`ref-${r.key}`} style={row}>
                    <span style={rowLabel}>{r.key}</span>
                    <span style={rowValue}>
                      {num(r.sessions)} sess · {num(r.signups)} cad ·{' '}
                      {pct(r.rate)}
                    </span>
                  </div>
                ))}
              </>
            )}

            <Text style={styles.footer}>
              Este relatório é enviado automaticamente todo dia 1 de cada mês.
              Link de download válido por 90 dias.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MonthlyReportEmail,
  subject: ({ periodLabel }: MonthlyReportProps) =>
    `Relatório mensal RankMyMatch — ${periodLabel ?? 'novo período'}`,
  displayName: 'Relatório mensal',
  previewData: {
    periodLabel: 'outubro de 2025',
    downloadUrl: 'https://example.com/report.pdf',
    summary: {
      month: {
        sessions: 1250,
        pageviews: 3400,
        newVisitors: 980,
        signups: 44,
        visitToSignupPct: 3.52,
        bounceRate: 62.3,
      },
      last7d: { sessions: 320, signups: 12, conversionPct: 3.75 },
      last30d: { sessions: 1180, signups: 41, conversionPct: 3.47 },
      topUtmSources: [
        { key: 'google', sessions: 800, signups: 30, rate: 3.75 },
        { key: '(direto)', sessions: 250, signups: 8, rate: 3.2 },
      ],
      topReferrers: [
        { key: 'google.com', sessions: 700, signups: 28, rate: 4.0 },
      ],
    },
  },
} satisfies TemplateEntry

export default MonthlyReportEmail
