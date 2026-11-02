import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { SITE_NAME, styles } from './_brand'

function InfrastructureTestEmail() {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Teste solicitado de envio de e-mail do Raqueteia.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandText}>{SITE_NAME}</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>Teste de envio de e-mail</Heading>
            <Text style={styles.text}>
              Esta mensagem foi enviada a seu pedido para verificar a infraestrutura
              de e-mails do Raqueteia no encerramento da Fase 2.
            </Text>
            <Text style={styles.text}>
              Não é um pedido de exclusão de conta, relatório esportivo ou alteração
              de cadastro. Nenhuma ação é necessária. O recebimento desta mensagem
              deve ser confirmado na caixa de entrada para concluir a verificação.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InfrastructureTestEmail,
  subject: 'Raqueteia — teste solicitado de envio de e-mail',
  displayName: 'Teste de infraestrutura de e-mail',
  to: 'bimbapps@gmail.com',
  previewData: {},
} satisfies TemplateEntry