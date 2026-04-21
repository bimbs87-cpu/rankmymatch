import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from '@react-email/components'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ email, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a alteração de e-mail no {SITE_NAME}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>{SITE_NAME}</Text>
          <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme seu novo e-mail</Heading>
          <Text style={styles.text}>
            Você pediu para alterar o e-mail da sua conta no <strong>{SITE_NAME}</strong> de{' '}
            <Link href={`mailto:${email}`} style={styles.link}>{email}</Link> para{' '}
            <Link href={`mailto:${newEmail}`} style={styles.link}>{newEmail}</Link>.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>Confirmar alteração</Button>
          </Section>
          <Text style={styles.footer}>
            Se não foi você, proteja sua conta imediatamente alterando sua senha.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
