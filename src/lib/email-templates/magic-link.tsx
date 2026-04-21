import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso ao {SITE_NAME}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>{SITE_NAME}</Text>
          <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Seu link de acesso</Heading>
          <Text style={styles.text}>
            Clique no botão abaixo para entrar no <strong>{SITE_NAME}</strong>. Este link expira em alguns minutos.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>Entrar agora</Button>
          </Section>
          <Text style={styles.footer}>
            Se você não solicitou este link, pode ignorar este e-mail.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
