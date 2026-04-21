import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from '@react-email/components'
import { styles, SITE_NAME, SITE_TAGLINE } from './_brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o {SITE_NAME}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>{SITE_NAME}</Text>
          <Text style={styles.brandSub}>{SITE_TAGLINE}</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Você foi convidado</Heading>
          <Text style={styles.text}>
            Você recebeu um convite para entrar no{' '}
            <Link href={siteUrl} style={styles.link}><strong>{SITE_NAME}</strong></Link>{' '}
            — a plataforma de ranking para seu grupo de padel.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>Aceitar convite</Button>
          </Section>
          <Text style={styles.footer}>
            Se você não esperava este convite, pode ignorar este e-mail.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
