import { X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import selfsigned from "selfsigned";
import { localAddresses } from "./config.js";

const CONFIG_DIR = path.join(os.homedir(), ".lol-remote");
const CERT_FILE = path.join(CONFIG_DIR, "cert.pem");
const KEY_FILE = path.join(CONFIG_DIR, "key.pem");

export interface Certificate {
  key: string;
  cert: string;
}

/**
 * Vercel (and any HTTPS page) refuses to call an http:// LAN address as mixed
 * content, so the agent needs to speak TLS too. There's no public CA for a
 * private LAN IP, so this is self-signed — the phone's browser will warn once
 * on first visit; accepting it is a one-time step per device.
 *
 * Regenerated whenever the current LAN address isn't already covered by the
 * cached cert (e.g. a new router handed out a different IP).
 */
export async function getOrCreateCert(): Promise<Certificate> {
  const cached = readCached();
  if (cached && coversCurrentAddresses(cached.cert)) return cached;
  return generate();
}

function readCached(): Certificate | null {
  try {
    return { key: readFileSync(KEY_FILE, "utf8"), cert: readFileSync(CERT_FILE, "utf8") };
  } catch {
    return null;
  }
}

function coversCurrentAddresses(certPem: string): boolean {
  const cert = new X509Certificate(certPem);
  const san = cert.subjectAltName ?? "";
  return localAddresses().every((address) => san.includes(`IP Address:${address}`));
}

async function generate(): Promise<Certificate> {
  const altNames: { type: 2 | 7; value?: string; ip?: string }[] = [
    { type: 2, value: "localhost" }, // DNS
    { type: 7, ip: "127.0.0.1" }, // IP
    ...localAddresses().map((address) => ({ type: 7 as const, ip: address })),
  ];

  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate);
  notAfterDate.setFullYear(notBeforeDate.getFullYear() + 10);

  const pems = await selfsigned.generate([{ name: "commonName", value: "lol-remote-agent" }], {
    notBeforeDate,
    notAfterDate,
    keySize: 2048,
    extensions: [{ name: "subjectAltName", altNames }],
  });

  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(KEY_FILE, pems.private, "utf8");
  writeFileSync(CERT_FILE, pems.cert, "utf8");

  return { key: pems.private, cert: pems.cert };
}
