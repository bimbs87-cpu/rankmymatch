import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from '@react-email/components'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail no {SITE_NAME}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>{SITE_NAME}</Text>
          <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme seu e-mail</Heading>
          <Text style={styles.text}>
            Bem-vindo ao <strong>{SITE_NAME}</strong>! Para começar a registrar partidas e subir no ranking,
            confirme seu endereço <Link href={`mailto:${recipient}`} style={styles.link}>{recipient}</Link>.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>Confirmar e-mail</Button>
          </Section>
          <Text style={styles.footer}>
            Se você não criou esta conta, pode ignorar este e-mail com segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
