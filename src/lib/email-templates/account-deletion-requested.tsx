import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { styles, SITE_NAME, SITE_TAGLINE, SITE_URL } from './_brand'

interface AccountDeletionRequestedProps {
  name?: string
  scheduledFor?: string // ISO date string
}

function formatDate(iso?: string): string {
  if (!iso) return 'em 7 dias'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
    })
  } catch {
    return 'em 7 dias'
  }
}

const AccountDeletionRequestedEmail = ({
  name,
  scheduledFor,
}: AccountDeletionRequestedProps) => {
  const formatted = formatDate(scheduledFor)
  const cancelUrl = `${SITE_URL}/profile`
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        Sua conta no {SITE_NAME} será excluída em {formatted}. Você pode cancelar.
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandText}>{SITE_NAME}</Text>
            <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>
              {name ? `${name}, sua exclusão foi agendada` : 'Exclusão de conta agendada'}
            </Heading>
            <Text style={styles.text}>
              Recebemos seu pedido para excluir sua conta no <strong>{SITE_NAME}</strong>.
              Iniciamos um <strong>período de carência de 7 dias</strong> antes da exclusão definitiva.
            </Text>

            <Section style={styles.warning}>
              <strong>Data da exclusão:</strong> {formatted}
            </Section>

            <Text style={styles.text}>
              <strong>Mudou de ideia?</strong> Você pode cancelar a qualquer momento até essa data.
              Basta entrar no app e clicar em "Cancelar exclusão" no seu perfil.
            </Text>

            <Section style={styles.buttonWrap}>
              <Button style={styles.button} href={cancelUrl}>
                Cancelar exclusão
              </Button>
            </Section>

            <Text style={{ ...styles.text, fontSize: '13px' }}>
              <strong>O que acontece após os 7 dias:</strong>
            </Text>
            <ul style={{ fontSize: '13px', color: '#55575d', lineHeight: '1.7', margin: '0 0 20px', paddingLeft: '20px' }}>
              <li>Seus dados pessoais (nome, foto, contatos) são removidos.</li>
              <li>Você é removido de todos os grupos.</li>
              <li>Suas partidas anteriores ficam anonimizadas como "Usuário removido" para preservar o histórico dos grupos.</li>
              <li>Notificações, assinaturas push e configurações são apagadas.</li>
            </ul>

            <Text style={styles.footer}>
              Dúvidas? Responda este e-mail ou fale com o suporte: contato@rankmymatch.app
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AccountDeletionRequestedEmail,
  subject: ({ name }: AccountDeletionRequestedProps) =>
    name
      ? `${name}, sua conta no ${SITE_NAME} será excluída em 7 dias`
      : `Sua conta no ${SITE_NAME} será excluída em 7 dias`,
  displayName: 'Exclusão de conta agendada',
  previewData: {
    name: 'João',
    scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
} satisfies TemplateEntry

export default AccountDeletionRequestedEmail
