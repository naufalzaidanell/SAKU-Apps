export function verifiedSsl(caBase64 = process.env.DATABASE_CA_CERT_BASE64) {
  const ssl = { rejectUnauthorized: true };
  if (String(caBase64 || '').trim()) {
    const ca = Buffer.from(String(caBase64), 'base64').toString('utf8');
    if (!ca.includes('BEGIN CERTIFICATE')) throw new Error('DATABASE_CA_CERT_INVALID');
    ssl.ca = ca;
  }
  return ssl;
}

export function verifiedPoolConfig(connectionString, { max, statementTimeout }) {
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    max,
    ssl: verifiedSsl(),
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout + 1_000,
    connectionTimeoutMillis: 5_000,
  };
}
