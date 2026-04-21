/**
 * Server-side Web Push helpers.
 *
 * Implements RFC 8030 + RFC 8291 (aes128gcm) + VAPID (RFC 8292) using only
 * Web Crypto APIs available in the Cloudflare Worker / TanStack Start server
 * runtime. No npm dependency on `web-push` (which is Node-only).
 *
 * Usage:
 *   import { sendPushTo } from "@/lib/web-push.server";
 *   await sendPushTo(userId, { title, body, url, type, data });
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  type?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

const TEXT = new TextEncoder();

// ---------- base64url helpers ----------
function b64uToBytes(b64u: string): Uint8Array {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const b64 = (b64u + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64u(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; nextOffset: number } {
  const first = bytes[offset];
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }
  const count = first & 0x7f;
  let length = 0;
  for (let i = 0; i < count; i++) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, nextOffset: offset + 1 + count };
}

function normalizeJoseEs256Signature(signature: Uint8Array): Uint8Array {
  // Some runtimes return ECDSA signatures as raw JOSE bytes (r||s, 64 bytes),
  // while others return ASN.1 DER. VAPID JWTs need JOSE format.
  if (signature.length === 64 && signature[0] !== 0x30) {
    return signature;
  }
  if (signature[0] !== 0x30) {
    throw new Error("Invalid ECDSA signature format");
  }

  const sequence = readDerLength(signature, 1);
  let offset = sequence.nextOffset;

  const readInteger = (): Uint8Array => {
    if (signature[offset] !== 0x02) throw new Error("Invalid DER integer");
    const len = readDerLength(signature, offset + 1);
    const start = len.nextOffset;
    const end = start + len.length;
    offset = end;
    let value = signature.slice(start, end);
    while (value.length > 0 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) value = value.slice(value.length - 32);
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };

  const r = readInteger();
  const s = readInteger();
  return concatBytes(r, s);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Always materialize a strict ArrayBuffer (not SharedArrayBuffer) so the
// value satisfies BufferSource in TS strict mode.
function toAB(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

// ---------- VAPID JWT (ES256) ----------
async function importVapidPrivateKey(privB64u: string, pubB64u: string): Promise<CryptoKey> {
  const d = bytesToB64u(b64uToBytes(privB64u));
  const pubBytes = b64uToBytes(pubB64u);
  // pub is uncompressed P-256: 0x04 || X(32) || Y(32)
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID public key must be uncompressed P-256 (65 bytes)");
  }
  const x = bytesToB64u(pubBytes.slice(1, 33));
  const y = bytesToB64u(pubBytes.slice(33, 65));
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d,
    x,
    y,
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildVapidAuthHeader(
  audience: string,
  subject: string,
  publicKeyB64u: string,
  privateKeyB64u: string,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
    sub: subject.startsWith("mailto:") || subject.startsWith("https://")
      ? subject
      : `mailto:${subject}`,
  };
  const headerB64 = bytesToB64u(TEXT.encode(JSON.stringify(header)));
  const payloadB64 = bytesToB64u(TEXT.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importVapidPrivateKey(privateKeyB64u, publicKeyB64u);
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key,
    TEXT.encode(signingInput),
  );
  const sigB64 = bytesToB64u(normalizeJoseEs256Signature(new Uint8Array(sigBuf)));
  const jwt = `${signingInput}.${sigB64}`;
  return `vapid t=${jwt}, k=${publicKeyB64u}`;
}

// ---------- HKDF ----------
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", toAB(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toAB(salt), info: toAB(info) },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ---------- aes128gcm encryption (RFC 8291) ----------
async function encryptPayload(
  plaintext: Uint8Array,
  recipientPubB64u: string,
  recipientAuthB64u: string,
): Promise<{ body: Uint8Array; serverPublicKeyRaw: Uint8Array }> {
  const recipientPub = b64uToBytes(recipientPubB64u);
  const auth = b64uToBytes(recipientAuthB64u);

  // Server ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  // Import recipient public key (raw, 65 bytes uncompressed)
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    toAB(recipientPub),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    serverKeyPair.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedBits);

  // PRK_key = HKDF(auth, sharedSecret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concatBytes(
    TEXT.encode("WebPush: info\0"),
    recipientPub,
    serverPubRaw,
  );
  const prkKey = await hkdf(auth, sharedSecret, keyInfo, 32);

  // salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK = HKDF(salt, prkKey, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cek = await hkdf(
    salt,
    prkKey,
    concatBytes(TEXT.encode("Content-Encoding: aes128gcm\0")),
    16,
  );
  // NONCE = HKDF(salt, prkKey, "Content-Encoding: nonce" || 0x00, 12)
  const nonce = await hkdf(
    salt,
    prkKey,
    concatBytes(TEXT.encode("Content-Encoding: nonce\0")),
    12,
  );

  // Plaintext padded with 0x02 || 0x00*pad (for last record)
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey("raw", toAB(cek), { name: "AES-GCM" }, false, ["encrypt"]);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toAB(nonce) }, aesKey, toAB(padded));
  const ciphertext = new Uint8Array(ctBuf);

  // Header: salt(16) || rs(uint32 BE) || idlen(1) || keyid(idlen)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, rs, new Uint8Array([serverPubRaw.length]), serverPubRaw);

  return { body: concatBytes(header, ciphertext), serverPublicKeyRaw: serverPubRaw };
}

// ---------- public sender ----------
interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

export async function sendPushToUserIds(
  userIds: string[],
  payload: PushPayload,
) : Promise<{ sent: number; failed: number; error?: string }> {
  if (!userIds.length) return { sent: 0, failed: 0 };

  const pubKey = process.env.VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@rankmymatch.app";
  if (!pubKey || !privKey) {
    console.warn("[push] VAPID keys missing — skipping send");
    return { sent: 0, failed: 0 };
  }

  // Respect per-user, per-event-type preferences. Default = ON when no row.
  let allowedUserIds = userIds;
  if (payload.type) {
    const { data: prefs } = await supabaseAdmin
      .from("push_notification_preferences")
      .select("user_id, enabled")
      .in("user_id", userIds)
      .eq("event_type", payload.type);
    const optedOut = new Set(
      (prefs || []).filter((p) => p.enabled === false).map((p) => p.user_id),
    );
    allowedUserIds = userIds.filter((u) => !optedOut.has(u));
  }
  if (!allowedUserIds.length) return { sent: 0, failed: 0 };

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .in("user_id", allowedUserIds);

  if (error) {
    console.error("[push] subscription lookup failed", error);
    return { sent: 0, failed: 0, error: "subscription_lookup_failed" };
  }
  console.log("[push] dispatch", {
    type: payload.type,
    requestedUserIds: userIds.length,
    allowedUserIds: allowedUserIds.length,
    subscriptions: subs?.length || 0,
  });
  if (!subs?.length) {
    console.warn("[push] no active subscriptions for allowed users", {
      allowedUserIds,
    });
    return { sent: 0, failed: 0, error: "no_active_subscriptions" };
  }

  const payloadBytes = TEXT.encode(JSON.stringify(payload));

  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  await Promise.all(
    (subs as SubscriptionRow[]).map(async (s) => {
      try {
        const url = new URL(s.endpoint);
        const audience = `${url.protocol}//${url.host}`;
        const auth = await buildVapidAuthHeader(audience, subject, pubKey, privKey);
        const { body } = await encryptPayload(payloadBytes, s.p256dh, s.auth);

        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "86400",
            Urgency: "normal",
          },
          // Materialize a strict ArrayBuffer (BodyInit-compatible).
          body: toAB(body),
        });

        if (res.status === 201 || res.status === 200 || res.status === 202) {
          sent += 1;
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", s.id);
        } else if (res.status === 404 || res.status === 410) {
          // Endpoint gone — drop it
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
          failed += 1;
          lastError = `endpoint_gone_${res.status}`;
        } else {
          failed += 1;
          lastError = `push_service_${res.status}`;
          console.error("[push] provider rejected notification", {
            subscriptionId: s.id,
            status: res.status,
            endpointHost: url.host,
          });
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ failure_count: s.failure_count + 1 })
            .eq("id", s.id);
        }
      } catch (err) {
        console.error("[push] send failed", err);
        failed += 1;
        lastError = err instanceof Error ? err.message : "push_send_failed";
      }
    }),
  );

  return { sent, failed, error: sent === 0 && failed > 0 ? lastError || "push_delivery_failed" : undefined };
}
