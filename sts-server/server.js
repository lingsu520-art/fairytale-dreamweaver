require('dotenv').config();
const express = require('express');
const cors = require('cors');
const China_Core = require('@alicloud/pop-core');

const app = express();

// ---------- CORS ----------
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  methods: ['GET'],
}));

// ---------- STS Client ----------
const stsClient = new China_Core({
  accessKeyId: process.env.ACCESS_KEY_ID,
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  endpoint: 'https://sts.aliyuncs.com',
  apiVersion: '2015-04-01',
});

// ---------- /sts-token ----------
app.get('/sts-token', async (req, res) => {
  try {
    const result = await stsClient.request('AssumeRole', {
      RoleArn: process.env.ROLE_ARN,
      RoleSessionName: 'fairytale-web-upload',
      DurationSeconds: process.env.TOKEN_DURATION || 3600,
    }, { method: 'POST' });

    const cred = result.Credentials;
    res.json({
      accessKeyId: cred.AccessKeyId,
      accessKeySecret: cred.AccessKeySecret,
      stsToken: cred.SecurityToken,
      expiration: cred.Expiration,
    });
  } catch (err) {
    console.error('STS error:', err.message);
    res.status(500).json({ error: 'Failed to get STS token' });
  }
});

// ---------- Health check ----------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Start ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`STS server running on port ${PORT}`);
});
