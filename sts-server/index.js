const China_Core = require('@alicloud/pop-core');

// 从环境变量读取配置
const stsClient = new China_Core({
  accessKeyId: process.env.ACCESS_KEY_ID,
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  endpoint: 'https://sts.aliyuncs.com',
  apiVersion: '2015-04-01',
});

exports.handler = async (req, res, context) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.setStatusCode(204);
    return res.send('');
  }

  // 健康检查
  if (req.path === '/health') {
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify({ status: 'ok' }));
  }

  // STS Token 接口
  if (req.path === '/sts-token' || req.path === '/') {
    try {
      const result = await stsClient.request('AssumeRole', {
        RoleArn: process.env.ROLE_ARN,
        RoleSessionName: 'fairytale-web-upload',
        DurationSeconds: 3600,
      }, { method: 'POST' });

      const cred = result.Credentials;
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify({
        accessKeyId: cred.AccessKeyId,
        accessKeySecret: cred.AccessKeySecret,
        stsToken: cred.SecurityToken,
        expiration: cred.Expiration,
      }));
    } catch (err) {
      console.error('STS error:', err.message);
      res.setStatusCode(500);
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify({ error: 'Failed to get STS token' }));
    }
  }

  res.setStatusCode(404);
  return res.send('Not Found');
};
