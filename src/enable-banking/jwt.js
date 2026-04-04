import jwt from 'jsonwebtoken';

export function generateJWT(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: now,
      exp: now + 3600,
    },
    privateKeyPem,
    { algorithm: 'RS256', header: { kid: appId } }
  );
}
