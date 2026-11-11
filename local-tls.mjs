import forge from "node-forge";
import { randomBytes, X509Certificate } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
export function ensureLocalTls(directory) {
  const folder = resolve(directory);
  mkdirSync(folder, { recursive: true });
  const certFile = join(folder, "localhost-cert.pem"),
    keyFile = join(folder, "localhost-key.pem");
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    const keys = forge.pki.rsa.generateKeyPair(2048),
      cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01" + randomBytes(16).toString("hex");
    cert.validity.notBefore = new Date(Date.now() - 300000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
    const subject = [
      { name: "commonName", value: "localhost" },
      { name: "organizationName", value: "Tim Rent Car Local Demonstration" },
    ];
    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.setExtensions([
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    writeFileSync(keyFile, forge.pki.privateKeyToPem(keys.privateKey), {
      mode: 0o600,
    });
    writeFileSync(certFile, forge.pki.certificateToPem(cert));
  }
  const cert = readFileSync(certFile),
    x509 = new X509Certificate(cert);
  return {
    certFile,
    keyFile,
    cert,
    fingerprint: x509.fingerprint256,
    subject: x509.subject,
    validTo: x509.validTo,
  };
}
if (process.argv[1]?.endsWith("local-tls.mjs")) {
  const tls = ensureLocalTls(process.argv[2] || "data/tls");
  console.log(JSON.stringify({ ...tls, cert: undefined }, null, 2));
}
