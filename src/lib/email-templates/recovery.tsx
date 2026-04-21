import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha no {SITE_NAME}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>{SITE_NAME}</Text>
          <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Redefina sua senha</Heading>
          <Text style={styles.text}>
            Recebemos um pedido para redefinir a senha da sua conta no <strong>{SITE_NAME}</strong>.
            Clique abaixo para escolher uma nova senha.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>Redefinir senha</Button>
          </Section>
          <Text style={styles.footer}>
            Se você não pediu essa alteração, pode ignorar este e-mail. Sua senha atual continua válida.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
